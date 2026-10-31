# SpendWise

Know where your money goes. Note an expense in one sentence (English or Hinglish) or by voice, see what was essential and what was optional, set budgets with 75/90/100% alerts, and ask an AI money coach that only uses your own numbers.

**Live:** https://spendwise.dishis.workers.dev

Runs entirely on Cloudflare:

| Piece | What it does |
|---|---|
| **App** — Next.js 16 on Workers via [OpenNext](https://opennext.js.org/cloudflare) | UI, API routes, sign-in |
| **Cloudflare D1** (`spendwise-db`) | Users, sessions, transactions, budgets, goals |
| **`spendwise-ai` worker** — Workers AI (Cloudflare-hosted models only) | Chat entry, statements and bill photos (Llama 4 Scout, JSON mode + vision), money coach (Llama 3.3 70B, streamed), voice (Whisper), PDF reading (`toMarkdown`) |
| **Cloudflare R2** (`spendwise-statements`) | Uploaded bank statements for background imports |
| **Cloudflare Workflows** (`spendwise-statement-import`) | Reads big statements in the background, step by step with retries; keeps going if the user closes the page |
| **Workers rate limiting** | Sign-in attempts and AI calls |

### Bank statements

Drop a PDF, Excel or CSV statement into the chat (or attach it). Signed-in users get a background import: the file goes to R2 and a Workflow reads it while the chat shows live progress ("Found 545 transactions on 78 pages", "Sorted payees 1–50: Blinkit → Groceries …"), so the page can be closed.

- **Reading:** regular layouts (UPI apps such as Navi, PhonePe, Paytm) are read by code (`src/lib/ai/statement-parser.ts`), so amounts, dates and money-in/money-out come straight from the file. Other layouts fall back to Workers AI page by page.
- **Sorting:** the AI only sorts payee names into categories.
- **Card bills and wallet top-ups** are left out so nothing counts twice.
- **Duplicates** already recorded are skipped.
- **Questions:** you're asked once per person (biggest first), with a "Keep all as sorted" option. Your answers are remembered for the next import.

See [PROJECT.md](./PROJECT.md) for the full architecture.

## Run locally

Requires Node 22.18+ and a Cloudflare login (`npx wrangler login`) for the AI features.

```bash
npm install --legacy-peer-deps
```

```bash
npm run db:migrate:local
```

Create `.dev.vars` (gitignored) with the AI worker secret:

```env
CF_AI_WORKER_SECRET=<same value as API_SECRET on the spendwise-ai worker>
```

```bash
npm run dev
```

Open http://localhost:3000. `next dev` gets the D1, rate-limit and AI bindings from `wrangler.jsonc` through OpenNext (local D1 lives in `.wrangler/`). Without the secret, extraction falls back to the offline parser and the coach to basic answers. **Try the demo** on the sign-in page runs on sample data in your browser with no account.

## Deploy

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

First deploy only: `npx wrangler secret put CF_AI_WORKER_SECRET`.

The AI worker lives in `workers/spendwise-ai` and deploys separately:

```bash
cd workers/spendwise-ai && npm install && npx wrangler deploy
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Local dev server with Cloudflare bindings |
| `npm test` | Unit tests (`tests/*.test.mjs`): finance maths, offline parser, duplicate matching, statement reader |
| `npm run lint` | ESLint |
| `npm run preview` | Build with OpenNext and run in the Workers runtime locally |
| `npm run deploy` | Build with OpenNext and deploy to Cloudflare |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply `migrations/` to local / production D1 |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc` |

## Security

- Passwords: PBKDF2-SHA256 (100k iterations, per-user salt). Sessions: random tokens in an httpOnly, Secure, SameSite=Lax cookie; only their SHA-256 is stored.
- Every API route checks the session and scopes queries to the signed-in user.
- The AI worker is called only from the server with a shared secret, and is rate-limited per user (or per IP for the demo).
- AI never computes financial figures. The coach receives totals the app calculated and is told to quote only those.

MIT License.
