# spendwise-ai

This is the AI worker for SpendWise. Every AI call the app makes goes through it, along with the background statement-import Workflow. It uses Cloudflare-hosted Workers AI models only.

**URL:** https://spendwise-ai.dishis.workers.dev. Only the SpendWise server calls it; browsers never do.

## Models

These are set as vars in `wrangler.jsonc`:

| Var | Model | Used for |
|---|---|---|
| `ENTRY_MODEL` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Chat entry, statements (payee sorting and the AI fallback reader), photos (vision) |
| `TEXT_MODEL` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Money coach (streamed) |
| `EXTRACT_MODEL` | `@cf/meta/llama-3.1-8b-instruct-fast` | Single-expense extraction (form helper) |
| `SPEECH_MODEL` | `@cf/openai/whisper-large-v3-turbo` | Voice notes |
| (built in) | `env.AI.toMarkdown` | PDF / Excel to text |

**JSON output.** Structured output uses JSON mode (`response_format: json_schema`), and every result is checked in code.

**No maths by the model.** The models never compute money:
- Amounts must appear in the user's text or the file (the amount guard).
- Bills need a printed total line.
- Splits are divided in code.
- Statement amounts and dates are read by `src/lib/ai/statement-parser.ts` whenever the layout allows.

## Bindings and secrets

| Binding | What |
|---|---|
| `AI` | Workers AI |
| `DB` | D1 `spendwise-db` (shared with the app; used by the Workflow) |
| `STATEMENTS` | R2 `spendwise-statements` (uploaded statements) |
| `STATEMENT_IMPORT` | Workflow `spendwise-statement-import` (class `StatementImportWorkflow`) |
| `RATE_LIMITER` | 30 requests per minute per `X-Client-Id` |
| `API_SECRET` (secret) | Bearer token; the app has the same value as `CF_AI_WORKER_SECRET` |

## Requests

Every `/v1/*` request is a `POST` with a JSON body and these headers:

```
Authorization: Bearer <API_SECRET>
X-Client-Id: user:<user id>  or  ip:<address> (demo)    rate-limit key
Content-Type: application/json
```

**Errors** come back as `{ "error": "message" }` with these statuses:

| Status | Meaning |
|---|---|
| 400 | Bad input |
| 401 | Wrong or missing secret |
| 413 | Too large |
| 422 | Unreadable file |
| 429 | Rate limited |
| 502 | Model failed |

The app falls back to offline behaviour on errors other than 429.

`categories` below is always `{ "expense": [names...], "income": [names...] }`. `profile` is optional: `{ userType, monthlyIncome, goals[] }`.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /health` | – | `{ ok: true }` (no auth) |
| `POST /v1/entry` | `message` (≤1000 chars), `today` (YYYY-MM-DD), `timezone?`, `currency?`, `categories`, `pending?` (≤10 waiting items: `ref, description, category, transaction_type, amount, needs`), `history?` (≤8 turns), `profile?`, `context?` (this month's spending by category, budgets) | `{ data: { items[], answer_category, rule_payee, rule_category, reply, feedback }, model }` |
| `POST /v1/receipt` | `image` (base64 ≤4 MB), `mimeType`, `note?`, `today`, `timezone?`, `categories`, `profile?`, `context?` | `{ data: { items[] (with `total_label`, `split_between`), seen }, model }`; the worker divides splits and turns a missing total into an amount question |
| `POST /v1/statement` | `file` (base64 ≤8 MB), `filename` (.pdf .csv .txt .xlsx .xls .ods), `today`, `categories`, `profile?` | `{ data: { items[] }, stats: { rows?, mode: "rules" or chunks, truncated }, model }` |
| `POST /v1/jobs/statement` | `jobId` (an `import_jobs` row whose file is already in R2) | `{ ok: true }` (starts the Workflow) |
| `POST /v1/coach` | `question` (≤500 chars), `history?`, `language?` (`en` / `hinglish`), `context` (figures computed by the app) | Streamed plain text |
| `POST /v1/transcribe` | `audio` (base64 ≤ ~6 MB), `language?` | `{ text }` |
| `POST /v1/extract` | `input` (≤500 chars), `today`, `timezone?`, `currency?`, `categories` | `{ data: { transaction_type, amount, description, merchant, category, ... }, model }` |

**Items.** Entry, receipt and statement items share one shape: `transaction_type, amount, description, merchant, category, purchase_date, payment_method, essentiality, confidence, needs ("amount" | "category" | null), question, options[]`. Statement items add `date`, `time` and `payee`. The app maps category names to ids.

## Chat entry: what the model decides

- **Several items per message.** "450 lunch and 1200 petrol" becomes two items. An item without an amount gets `needs: "amount"`, and an unclear one (like "paid Rahul 500") gets `needs: "category"`, each with a question and options.
- **`answer_category`.** If the message explains what the first waiting item was for, this is its category, even for a long explanation ("he's my cousin, I pay him the EMI for my phone").
- **`rule_payee` / `rule_category`.** For "map all X payments to Y", "X is my rapido driver" or "sab Blinkit wale groceries mein daalo". The app applies the rule to every matching entry.
- **Amount guard.** After the model replies, every amount must match a number in the message, used once and closest to that item's words. Anything else becomes a question.

## Statements

`/v1/statement` (inline, used by the demo) and the Workflow work the same way:

1. **Text:** `toMarkdown` for PDF and Excel; CSV is parsed here.
2. **Rule-based read (`parseStatementText`):** used when at least 90% of the rows with an amount match "date … Paid to / Received from / Recharge of / Bill payment of … ₹amount". Otherwise the model reads the text page by page, and only amounts that appear in the page text are kept.
3. **Left out:** credit-card bill payments and UPI Lite / wallet top-ups.
4. **Payees** are grouped and sorted by the model, 50 per call: business / person / unclear, a category, an essentiality, a confidence and options.
5. **Questions** are written in code. Only people and unclear payees whose total is ₹500 or more are asked about.

### Background import Workflow (`StatementImportWorkflow`)

Started by `/v1/jobs/statement` for an `import_jobs` row. The app creates that row after uploading the file to R2 at `<userId>/<jobId>/<filename>`.

| Step | What it does |
|---|---|
| `load job` | Job, profile and categories. Also the user's earlier answers (`user_corrected_classification`), keyed by payee, so the same person isn't asked about twice |
| `read file` | Reads the file from R2 and converts it to text. Uses the rule-based reader if it can, or splits the text into pages (at most 60) for the model. Password-protected or unreadable files fail at once (`NonRetryableError`) |
| `plan payees`, then `sort payees N` | One step per 50 payees, each retried with backoff. (AI fallback: `read page N`, one step per page) |
| `check duplicates and save` | Loads entries within ±3 days of the statement's dates and runs `findDuplicates`. Inserts in batches of 50 with `import_job_id`; unclear rows get `review_status = 'pending_review'` plus the question and payee in `ai_extraction` |
| `mark failed` | On any error: `status = failed` with a readable message |

**Live log.** Each step appends a line to `import_jobs.events` with `json_insert`, and the chat polls the job to show it live. For example:

```
Found 545 transactions on 78 pages, read exactly from the file (7 are card bills or wallet top-ups, …)
Used your earlier answers for 4 payees
Sorted payees 1–50 of 219: Blinkit → Groceries, Zomato → Food & Dining, Airtel → Utilities · 21 are people
Checking 538 transactions against 12 you've already recorded around those dates
Done: saved 530, skipped 8 already recorded, 141 need a quick answer.
```

## Develop and deploy

1. Install dependencies:

   ```bash
   npm install
   ```

2. Type check:

   ```bash
   npx tsc --noEmit -p .
   ```

3. Set the secret the first time only:

   ```bash
   npx wrangler secret put API_SECRET
   ```

4. Deploy:

   ```bash
   npx wrangler deploy
   ```

**After changing bindings in `wrangler.jsonc`:** run `npx wrangler types` to regenerate `worker-configuration.d.ts`.

**Shared code.** The worker imports pure modules from the app (`../../../src/lib/ai/statement-parser.ts`, `dedupe.ts`), and wrangler bundles them. Keep those modules free of Node, React and DOM imports.

**Comparing models locally.** With `ALLOW_MODEL_OVERRIDE=true` in a local `.dev.vars`, an `x-model` header picks the model for `/v1/entry` and `/v1/statement`. Never set it in production.
