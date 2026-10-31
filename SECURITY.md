# Security

SpendWise holds people's financial records, so we take reports seriously.

## Reporting a problem

Please don't open a public issue for a security problem. Use GitHub's **Report a vulnerability** (private advisory) on this repository, and include:

- what you found, and where (URL, route or file)
- steps to reproduce
- what an attacker could do with it

We aim to reply within a few days, and to fix serious issues before discussing them publicly.

## How the app protects data

| Area | Protection |
|---|---|
| **Passwords** | PBKDF2-SHA256, 100,000 iterations, a random 16-byte salt per user. Never logged or returned. |
| **Sessions** | A 32-byte random token in an httpOnly, SameSite=Lax cookie (Secure in production), valid 30 days. The database stores only the token's SHA-256. Signing out deletes the session. |
| **Access control** | Every API route calls `requireUser()`, and every query is scoped to that user's id. Category ownership and type are checked on every write. |
| **Input** | Every request body is validated with zod, with size limits on text, files, audio and images. |
| **Abuse** | Sign-in, sign-up and email lookup are rate-limited per IP. AI calls are rate-limited per user (or per IP for the demo). |
| **AI worker** | Not callable from browsers: it requires a shared secret (`API_SECRET` / `CF_AI_WORKER_SECRET`), compared in constant time. |
| **Uploaded statements** | Stored in a private R2 bucket under `<userId>/<jobId>/`, read only by the import Workflow. Undoing an import deletes its entries. |
| **Bill photos and voice notes** | Sent to Workers AI for reading and not stored. |
| **Demo mode** | Runs entirely in the browser's localStorage; nothing is stored on the server. |
| **Secrets** | Kept in Cloudflare secrets in production and `.dev.vars` locally (gitignored). Nothing secret lives in `wrangler.jsonc` or the repository. |

## Known gaps

- There is no password reset yet; it needs an email sender.
- Statements uploaded to R2 are kept after the import finishes. A retention or cleanup job is on the roadmap ([TODO.md](./TODO.md)).
- There is no export or "delete my account" flow yet.

## For maintainers

- If a secret is ever committed or leaked, rotate it at once (`npx wrangler secret put …` on both workers for the AI secret), then remove it from the repository.
- Never paste real statements or personal data into issues, tests or fixtures.
