# SpendWise

Know where your money goes. SpendWise is a personal expense tracker for India (₹, Asia/Kolkata, English and Hinglish). You tell it what you spent the way you'd tell a friend, and it keeps the books.

**Live:** https://spendwise.dishis.workers.dev · **Try it without an account:** open the site and choose **Try the demo**.

## What it does

| | |
|---|---|
| **Chat to add spending** | Type or say several things at once ("450 lunch, 1200 petrol, kal auto mein 120 diye"). It saves them, and only asks about what's missing, with tap-to-answer options. |
| **Bank statements** | Drop a PDF, Excel or CSV statement into the chat. It's read in the background with a live progress log (you can close the page), duplicates are skipped, and you're asked once per person about unclear payments. |
| **Photos** | Snap a bill, receipt, payment screenshot or the item itself. |
| **Plain-language commands** | "Map all Prince Kumar payments to travel", "he's my cousin, I pay him my phone EMI": one answer files every matching payment and is remembered for next time. |
| **Feedback and warnings** | A short comment on each purchase, plus exact warnings when a budget is running out or a goal is at risk. |
| **Home, Timeline, Reports** | Left to spend this month, a pace chart, where it went, essential vs could-trim vs optional. |
| **Budgets and savings goals** | 75 / 90 / 100% alerts and suggested monthly amounts. |
| **Future planner** | What your own optional spending could become in an FD, a debt fund, an index fund or stocks, plus an advanced calculator. |
| **Ask for advice** | A money coach that answers from your own numbers. |

Everything is shaped by who you are: office job, business, freelance, student, homemaker or retired, plus your goals.

## How it's built

Everything runs on Cloudflare:

| Piece | Role |
|---|---|
| **Next.js 16 on Workers** via [OpenNext](https://opennext.js.org/cloudflare) (`spendwise`) | UI, API routes, sign-in |
| **D1** (`spendwise-db`) | Users, sessions, categories, transactions, budgets, goals, import jobs |
| **R2** (`spendwise-statements`) | Uploaded bank statements |
| **AI worker** (`workers/spendwise-ai`, `spendwise-ai`) | All AI calls, using Cloudflare-hosted models only |
| **Workers AI** | Llama 4 Scout for chat entry, statements and photos (vision); Llama 3.3 70B for the coach; Whisper for voice; `toMarkdown` for PDFs |
| **Workflows** (`spendwise-statement-import`) | Background statement imports, step by step with retries |
| **Rate limiting** | Sign-in attempts per IP; AI calls per user |

A few principles hold throughout:

- **The AI never does the maths.** All totals, budgets, warnings and projections are computed in code (`src/lib/calculations`).
- **Statements are read exactly.** Amounts and dates come from the file itself, and the AI only sorts payees into categories.
- **The app keeps working without AI.** If the AI is down, an offline parser and basic coach answers take over.

Read more:
- [PROJECT.md](./PROJECT.md): architecture, data flow, AI design, conventions
- [docs/API.md](./docs/API.md): the app's HTTP API
- [workers/spendwise-ai/README.md](./workers/spendwise-ai/README.md): the AI worker, its endpoints and the import Workflow
- [CONTRIBUTING.md](./CONTRIBUTING.md) · [SECURITY.md](./SECURITY.md) · [TODO.md](./TODO.md)

## Run locally

You need **Node 22.18+** and a Cloudflare account. The AI features call the deployed AI worker.

1. Install dependencies:

   ```bash
   npm install --legacy-peer-deps
   ```

2. Create the local database (stored in `.wrangler/`):

   ```bash
   npm run db:migrate:local
   ```

3. Copy `.dev.vars.example` to `.dev.vars` in the project root (gitignored) and fill in the shared AI secret:

   ```env
   CF_AI_WORKER_SECRET=<same value as API_SECRET on the spendwise-ai worker>
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

Open http://localhost:3000. `next dev` picks up the D1, R2 and rate-limit bindings from `wrangler.jsonc` through OpenNext.

- **Without the secret:** chat entry falls back to the offline parser and the coach to basic answers.
- **Background statement imports** run in the deployed Workflow against the production D1 and R2, so test them on the deployed app. Locally (and in the demo) statements are read inline instead.

## Deploy

### First time on a new Cloudflare account

1. Sign in:

   ```bash
   npx wrangler login
   ```

2. Create the database. Put the returned id into `database_id` in both `wrangler.jsonc` and `workers/spendwise-ai/wrangler.jsonc`:

   ```bash
   npx wrangler d1 create spendwise-db
   ```

3. Create the statements bucket:

   ```bash
   npx wrangler r2 bucket create spendwise-statements
   ```

4. Apply the migrations:

   ```bash
   npm run db:migrate:remote
   ```

5. Deploy the AI worker. Set its secret first; use a long random value:

   ```bash
   cd workers/spendwise-ai && npm install && npx wrangler secret put API_SECRET && npx wrangler deploy
   ```

6. Give the app the same secret, and point `CF_AI_WORKER_URL` in `wrangler.jsonc` at the AI worker's URL:

   ```bash
   npx wrangler secret put CF_AI_WORKER_SECRET
   ```

7. Deploy the app:

   ```bash
   npm run deploy
   ```

### After that

Apply any new migrations, then deploy the app:

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

Redeploy the AI worker whenever `workers/spendwise-ai` changes:

```bash
cd workers/spendwise-ai && npx wrangler deploy
```

Stop `next dev` before `npm run deploy`. Both write to `.next/`, and a running dev server makes the build fail.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Cloudflare bindings |
| `npm test` | Unit tests (`tests/*.test.mjs`): finance and investment maths, offline parser, duplicate matching, statement reader, name matching |
| `npm run lint` | ESLint |
| `npx tsc --noEmit -p .` | Type check |
| `npm run preview` | Build with OpenNext and run in the Workers runtime locally |
| `npm run deploy` | Build with OpenNext and deploy |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply `migrations/` to the local / production D1 |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc` |

## Project layout

```
src/app/                 Pages (landing, sign-in, onboarding, dashboard pages) and API routes (src/app/api)
src/components/          UI primitives ("Ledger" design system) and the app shell
src/lib/calculations/    All money maths (finance.ts, invest.ts), pure and unit-tested
src/lib/ai/              Offline parser, statement reader, duplicate and name matching (pure, tested)
src/lib/server/          Auth, D1 helpers, validation schemas, AI worker client
src/lib/data-service.ts  One data layer: the API when signed in, localStorage in the demo
workers/spendwise-ai/    The AI worker and the statement-import Workflow
migrations/              D1 schema
tests/                   node:test suites that import the real TypeScript modules
```

## Security

- **Passwords:** PBKDF2-SHA256 with 100k iterations and a per-user salt.
- **Sessions:** a random token in an httpOnly, Secure, SameSite=Lax cookie. Only the token's SHA-256 is stored.
- **API routes:** every route checks the session and scopes queries to the signed-in user.
- **AI worker:** called only from the server, with a shared secret, and rate-limited per user.
- **Uploaded statements** are kept in a private R2 bucket under the user's id. Bill photos are not stored.

See [SECURITY.md](./SECURITY.md) for how to report a problem.

## License

[MIT](./LICENSE)
