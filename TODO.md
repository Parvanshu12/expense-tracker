# SpendWise roadmap

## Done

- [x] **Foundation:** Next.js 16 app with dashboard, spending list, budgets, goals, reports, coach, planner and settings.
- [x] **Cloudflare-native:**
  - [x] D1 database and the app's own email + password auth (one email-first form).
  - [x] Deployed with OpenNext.
  - [x] Demo mode that runs in the browser.
- [x] **AI worker** (`workers/spendwise-ai`), using Cloudflare-hosted models only, with an offline fallback when AI is down.
- [x] **Chat entry:**
  - [x] Several purchases per message, English and Hinglish, voice.
  - [x] Questions only for what's missing, with tap-to-answer options.
  - [x] Feedback on each purchase and exact budget / goal warnings.
- [x] **User type and goals** shape questions, feedback and the coach.
- [x] **Photos:** bills, receipts, payment screenshots and items (vision). Uses the printed total only, with splits divided in code.
- [x] **Bank statements:**
  - [x] Drag and drop.
  - [x] Background import (R2 + Workflow) with a live log.
  - [x] Rule-based reading of UPI-app statements, with AI used only to sort payees.
  - [x] Duplicate skipping; card bills and top-ups left out.
  - [x] One question per person, and Undo.
- [x] **Plain-language commands** ("map all X payments to travel"). Answers of any length are accepted and remembered for future imports.
- [x] **Timeline** coloured by kind of purchase.
- [x] **"Ledger" redesign** across every page, light and dark.
- [x] **Future planner:**
  - [x] Simple view from your own data ("instead of buying it", trim and invest, AI explanation).
  - [x] Advanced calculator.

## Next

- [ ] **Account:** password reset (needs an email sender), data export, delete my account.
- [ ] **Statements:**
  - [ ] Clean up uploaded files from R2 after import (retention policy).
  - [ ] Rule-based readers for common bank layouts (HDFC, SBI, ICICI tables with debit / credit / balance columns).
  - [ ] Password-protected PDFs: ask for the password in the chat instead of asking for an unlocked copy.
- [ ] **Learning:** show and edit "rules" (payee → category) in Settings.
- [ ] **Recurring payments:** detect rent, EMIs and subscriptions and remind before they're due.
- [ ] **Shared expenses:** split with family or friends, and settle up.
- [ ] **Reports:** a monthly email or PDF summary.
- [ ] **Tests:** end-to-end tests for the chat, imports and sign-in.
