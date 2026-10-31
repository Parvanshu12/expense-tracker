# Contributing to SpendWise

Thanks for helping. This guide covers how to work on the code. To get it running first, see [README.md](./README.md#run-locally); for how it fits together, see [PROJECT.md](./PROJECT.md).

## Workflow

1. Pull before you change anything:

   ```bash
   git pull origin main
   ```

2. Make your change, keeping it focused. If you change behaviour, update the docs that describe it: README, PROJECT.md, docs/API.md or the worker README.
3. Run the checks below and make sure they pass.
4. Commit with a message that says what changed and why, then push to `main`. The maintainers push straight to `main` with no pull requests. If you're an outside contributor, open a pull request instead.

## Checks

Run all four before you push:

```bash
npm test
```

```bash
npx tsc --noEmit -p .
```

```bash
npm run lint
```

```bash
cd workers/spendwise-ai && npx tsc --noEmit -p .
```

Also look at what you changed in the browser:
- light and dark mode
- a phone-width screen
- the demo ("Try the demo"), which runs on localStorage
- a signed-in account

## Rules that matter here

**Money**
- **Money maths lives in code, never in the AI.** Totals, budgets, warnings and projections belong in `src/lib/calculations` and need unit tests. Models classify, read and phrase things; code checks what they return.
- **Statement amounts come from the file.** Extend `src/lib/ai/statement-parser.ts`, with a test using made-up data, before you reach for a prompt.
- **Never commit real financial data.** Test fixtures use invented names and numbers.

**Data and AI**
- **Cloudflare only:** D1, R2, Workflows and Workers AI `@cf/` models. Don't add third-party AI or database services.
- **D1 limits:** at most 100 bound parameters per query. Chunk bulk `IN (...)` queries at 90.
- **Schema changes:**
  1. Add a new numbered file in `migrations/`; never edit an applied one.
  2. Apply it locally with `npm run db:migrate:local`, and to production with `npm run db:migrate:remote` before deploying.
- **Shared modules:** code imported by the AI worker or the tests (`src/lib/ai/*`, `src/lib/calculations/*`) must be pure TypeScript, with no React, DOM or Node imports, and use type-only imports.

**Client code**
- **Dates:** never call `new Date()` during render. Use `toLocalDateString()` for `YYYY-MM-DD`, since UTC is the previous day before 05:30 IST.
- **Next.js 16** has breaking changes. Check `node_modules/next/dist/docs/` before using an API you're unsure about (see [AGENTS.md](./AGENTS.md)).

**Design and copy**
- **Design:** follow the "Ledger" rules in [PROJECT.md](./PROJECT.md#7-design-ledger). Use few boxes, `<Money>` for every amount, and `brand` as the only accent colour.
- **Copy:** keep it plain and friendly for people who aren't comfortable with technology. No jargon, no emoji, no exclamation spam.

## Secrets

- **Where secrets go:** `.dev.vars` locally (gitignored; see `.dev.vars.example`) and `npx wrangler secret put` in production. Never put them in `wrangler.jsonc`, code or commits.
- **Before you push,** check that no secret or `.dev.vars` content is staged:

  ```bash
  git diff --cached
  ```

- **If a secret is ever committed,** rotate it immediately. Removing the commit is not enough.

## Deploying

The order matters:
1. Apply migrations.
2. Deploy the AI worker, if it changed.
3. Deploy the app.

Stop `next dev` before `npm run deploy`. The full steps are in [README.md](./README.md#deploy).
