/**
 * SpendWise AI worker — Workers AI endpoints for the SpendWise web app.
 *
 *   POST /v1/entry       chat message -> several transactions + questions for missing amounts
 *   POST /v1/receipt     photo of a bill, receipt or item -> transactions (vision)
 *   POST /v1/jobs/statement  start a background statement import (Workflow) for an import_jobs row
 *   POST /v1/statement   bank statement (PDF/Excel/CSV) -> transactions
 *   POST /v1/extract     natural-language expense -> structured transaction (JSON mode)
 *   POST /v1/coach       money-coach chat grounded in figures the app computed (SSE stream)
 *   POST /v1/transcribe  voice note (base64 audio) -> text (Whisper)
 *   GET  /health
 *
 * Only the Next.js server calls this worker. Every /v1 request must carry
 * `Authorization: Bearer <API_SECRET>`; the caller's user id or IP comes in
 * `X-Client-Id` and is used as the rate-limit key.
 */

import { NonRetryableError } from 'cloudflare:workflows';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { findDuplicates } from '../../../src/lib/ai/dedupe';
import { parseStatementText, tidyPayee, type ParsedStatementRow } from '../../../src/lib/ai/statement-parser';

declare global {
	interface Env {
		API_SECRET: string;
		/** Local benchmarking only: lets an `x-model` header pick the model. Never set in production. */
		ALLOW_MODEL_OVERRIDE?: string;
	}
}

const MAX_INPUT_CHARS = 500;
const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024; // ~6 MB of audio
const MAX_HISTORY_TURNS = 8;

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}

/** Constant-time comparison so the secret can't be guessed byte by byte from timing. */
function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	if (x.length !== y.length) return false;
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

async function readJson<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new HttpError(400, 'Request body must be JSON');
	}
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface ExtractRequest {
	input: string;
	currency?: string;
	today: string; // YYYY-MM-DD in the user's time zone
	timezone?: string;
	categories: { expense: string[]; income: string[] };
}

function extractionSchema(categories: ExtractRequest['categories']) {
	return {
		type: 'object',
		properties: {
			transaction_type: { type: 'string', enum: ['expense', 'income'] },
			amount: { type: ['number', 'null'], description: 'Positive amount, or null if not stated' },
			currency: { type: 'string' },
			description: { type: 'string', description: 'Short, clean title for the transaction' },
			merchant: {
				type: ['string', 'null'],
				description: 'A business or brand named in the note (e.g. Swiggy, DMart). null if none is named.',
			},
			category: { type: 'string', enum: [...categories.expense, ...categories.income] },
			purchase_date: { type: 'string', description: 'YYYY-MM-DD' },
			purchase_time: { type: ['string', 'null'], description: 'HH:MM (24h) or null' },
			payment_method: {
				type: ['string', 'null'],
				enum: ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Other', null],
			},
			essentiality: { type: 'string', enum: ['essential', 'optimizable', 'discretionary'] },
			confidence: { type: 'number', minimum: 0, maximum: 1 },
			reasoning: { type: 'string', description: 'One sentence on the category and essentiality' },
			needs_clarification: { type: 'boolean' },
			clarification_question: { type: ['string', 'null'] },
		},
		required: [
			'transaction_type',
			'amount',
			'currency',
			'description',
			'merchant',
			'category',
			'purchase_date',
			'purchase_time',
			'payment_method',
			'essentiality',
			'confidence',
			'reasoning',
			'needs_clarification',
			'clarification_question',
		],
	};
}

function extractionPrompt(req: ExtractRequest): string {
	return `You turn one short note about money into a single transaction record.
The note may be English, Hindi or Hinglish (e.g. "kal 450 ka khana swiggy se").

Today is ${req.today} (${req.timezone ?? 'Asia/Kolkata'}). Resolve relative dates ("yesterday", "kal", "last Friday") against today. If no date is mentioned, use today.
Default currency: ${req.currency ?? 'INR'}. "k" means thousand (2.5k = 2500). "₹", "rs", "rupees", "rupay" all mean INR.

Expense categories: ${req.categories.expense.join(', ')}.
Income categories: ${req.categories.income.join(', ')}.
Pick the category that matches transaction_type.

Essentiality (expenses only; use "essential" for income):
- essential: rent, groceries, utilities, medicine, insurance, education, basic commute
- optimizable: needed but reducible — food delivery, cabs, subscriptions, eating out
- discretionary: optional — entertainment, gadgets, shopping sprees, parties, travel for fun

Rules:
- Never invent an amount, merchant or payment method. Use null when it is not stated. A merchant is a named business or brand; "auto", "cab" or "shop" alone is not a merchant.
- If the amount is missing, set needs_clarification to true and ask one short question in clarification_question.
- description is a short human title (e.g. "Dinner from Swiggy"), not the raw note.
- confidence reflects how sure you are about amount, category and date together.

Examples of merchant:
- "auto rickshaw 120 cash" -> merchant null (a mode of transport, not a business)
- "petrol 1200" -> merchant null
- "2.5k groceries at dmart" -> merchant "DMart"
- "uber to office 240" -> merchant "Uber"`;
}

async function handleExtract(request: Request, env: Env): Promise<Response> {
	const body = await readJson<ExtractRequest>(request);
	const input = typeof body.input === 'string' ? body.input.trim() : '';
	if (!input) throw new HttpError(400, 'input is required');
	if (input.length > MAX_INPUT_CHARS) throw new HttpError(400, `input must be at most ${MAX_INPUT_CHARS} characters`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '')) throw new HttpError(400, 'today must be YYYY-MM-DD');
	if (!body.categories?.expense?.length || !body.categories?.income?.length) {
		throw new HttpError(400, 'categories.expense and categories.income are required');
	}

	const result = await env.AI.run(env.EXTRACT_MODEL, {
		messages: [
			{ role: 'system', content: extractionPrompt(body) },
			{ role: 'user', content: input },
		],
		response_format: { type: 'json_schema', json_schema: extractionSchema(body.categories) },
		temperature: 0.1,
		max_tokens: 512,
	});

	// JSON mode returns the parsed object in `response`; older shapes return a string.
	const raw = (result as { response?: unknown }).response;
	const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
	if (!data || typeof data !== 'object') throw new HttpError(502, 'Model returned no structured output');
	return json({ data, model: env.EXTRACT_MODEL });
}

// ---------------------------------------------------------------------------
// Chat entry: one message may hold several expenses; missing amounts get a question
// ---------------------------------------------------------------------------

interface PendingItem {
	ref: string;
	description: string;
	category: string;
	transaction_type: 'expense' | 'income';
	amount?: number | null;
	/** What we asked the user for. */
	needs?: 'amount' | 'category';
}

interface EntryProfile {
	userType?: string | null;
	monthlyIncome?: number | null;
	goals?: string[];
}

interface EntryContext {
	/** This month's spending per category, before this message. */
	monthSpentByCategory?: Record<string, number>;
	budgets?: { category: string; limit: number; spent: number }[];
}

interface EntryRequest {
	message: string;
	today: string;
	timezone?: string;
	currency?: string;
	categories: { expense: string[]; income: string[] };
	/** Items mentioned earlier that still need an amount or a category. */
	pending?: PendingItem[];
	/** Recent chat turns, oldest first, for context only. */
	history?: { role: 'user' | 'assistant'; content: string }[];
	profile?: EntryProfile;
	context?: EntryContext;
}

interface EntryItem {
	ref: string | null;
	transaction_type: 'expense' | 'income';
	amount: number | null;
	description: string;
	merchant: string | null;
	category: string;
	purchase_date: string;
	payment_method: string | null;
	essentiality: 'essential' | 'optimizable' | 'discretionary';
	confidence: number;
	needs: 'amount' | 'category' | null;
	question: string | null;
	options: string[];
}

function entrySchema(categories: EntryRequest['categories']) {
	const item = extractionSchema(categories);
	return {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				maxItems: 15,
				items: {
					type: 'object',
					properties: {
						ref: {
							type: ['string', 'null'],
							description: 'The ref of the pending item this message completes, otherwise null',
						},
						transaction_type: item.properties.transaction_type,
						amount: item.properties.amount,
						description: item.properties.description,
						merchant: item.properties.merchant,
						category: item.properties.category,
						purchase_date: item.properties.purchase_date,
						payment_method: item.properties.payment_method,
						essentiality: item.properties.essentiality,
						confidence: item.properties.confidence,
						needs: {
							type: ['string', 'null'],
							enum: ['amount', 'category', null],
							description: 'What you still need from the user for this item, or null if it can be saved',
						},
						question: {
							type: ['string', 'null'],
							description: 'When needs is set: one short, friendly question',
						},
						options: {
							type: 'array',
							maxItems: 4,
							items: { type: 'string' },
							description: 'When needs is "category": 2-4 likely category names, exactly as listed',
						},
					},
					required: [
						'ref',
						'transaction_type',
						'amount',
						'description',
						'merchant',
						'category',
						'purchase_date',
						'payment_method',
						'essentiality',
						'confidence',
						'needs',
						'question',
						'options',
					],
				},
			},
			answer_category: {
				type: ['string', 'null'],
				enum: [...categories.expense, ...categories.income, null],
				description: 'When the first waiting item needs a category and this message explains what it was for: the best category for it, else null',
			},
			rule_payee: {
				type: ['string', 'null'],
				description: 'When the user asks to file ALL payments to/from a person or business under one category: that name as they wrote it, else null',
			},
			rule_category: {
				type: ['string', 'null'],
				enum: [...categories.expense, ...categories.income, null],
				description: 'The category for rule_payee, else null',
			},
			reply: { type: 'string', description: 'Short message to the user' },
			feedback: {
				type: ['string', 'null'],
				description: 'One short, warm sentence about what was recorded, without numbers; null if nothing was recorded',
			},
		},
		required: ['items', 'answer_category', 'rule_payee', 'rule_category', 'reply', 'feedback'],
	};
}

const USER_TYPE_HINTS: Record<string, string> = {
	salaried: 'a salaried office-goer with a fixed monthly salary',
	business: 'a business owner whose income varies; they may mention stock, supplies, staff or shop expenses',
	freelancer: 'a freelancer or gig worker with irregular income from clients',
	student: 'a student living on pocket money or an allowance from family, with a small budget',
	homemaker: 'a homemaker running the household budget (groceries, bills, school fees)',
	retired: 'retired, living on a pension or savings',
};

function profileLines(profile: EntryProfile | undefined): string {
	if (!profile) return '';
	const lines = [];
	if (profile.userType) lines.push(`The user is ${USER_TYPE_HINTS[profile.userType] ?? profile.userType}.`);
	if (profile.monthlyIncome) lines.push(`Their monthly income is about ${profile.monthlyIncome}.`);
	if (profile.goals?.length) lines.push(`Their goals: ${profile.goals.join('; ')}.`);
	return lines.join(' ');
}

function entryPrompt(req: EntryRequest): string {
	const pending = req.pending?.length
		? `Items from earlier that are waiting on the user:\n${req.pending
				.map(
					(p) =>
						`- ref "${p.ref}": ${p.description} (${p.category}, ${p.transaction_type}${p.amount ? `, amount ${p.amount}` : ''}) — waiting for the ${p.needs ?? 'amount'}`
				)
				.join('\n')}\nIf the new message answers one of these, return it with the same ref and the missing detail filled in. Do not return pending items the message does not mention.`
		: 'No items are waiting on the user.';
	const history = req.history?.length
		? `Recent conversation (context only):\n${req.history.map((h) => `${h.role}: ${h.content}`).join('\n')}`
		: '';
	const context = req.context
		? `Spending so far this month (context for feedback only, before this message): ${JSON.stringify(req.context)}`
		: '';

	return `You help someone record their spending and income by chatting. Turn their latest message into a list of transactions.
The message may be English, Hindi or Hinglish, typed or spoken, and may list several things at once.
${profileLines(req.profile)}

Today is ${req.today} (${req.timezone ?? 'Asia/Kolkata'}). Resolve relative dates ("yesterday", "kal", "last Friday") against today; default to today.
Default currency: ${req.currency ?? 'INR'}. "k" means thousand (2.5k = 2500); "lakh" means 100000. "₹", "rs", "rupees" mean INR.

Expense categories: ${req.categories.expense.join(', ')}.
Income categories: ${req.categories.income.join(', ')}.

Essentiality (use "essential" for income):
- essential: rent, groceries, utilities, medicine, insurance, education, basic commute, fuel
- optimizable: needed but reducible — food delivery, cabs, subscriptions, eating out, coffee
- discretionary: optional — entertainment, gadgets, clothes, parties, trips

${pending}

${history}

${context}

Rules:
- One item per purchase or income. "450 lunch and 1200 petrol" is two items. "dinner for 4 people, 2000" is one item. "lunch and coffee, 600 total" is one item.
- amount is the number the user gave for that item only. If they gave none, amount is null. Never guess, copy another item's amount, or split a total.
- Ask only what is needed to record it correctly, at most one question per item:
  - needs "amount" when amount is null. question asks only for the amount (e.g. "How much were the shoes?").
  - needs "category" when you genuinely can't tell what it was (e.g. "Amazon 2000", "DMart 1500", "paid Rahul 500"). question asks what it was for, in plain words, and options lists 2-4 likely categories copied exactly from the lists above.
  - Otherwise needs is null, question is null and options is []. Don't ask when a sensible person could infer it.
  - Write questions in the user's language (Hinglish if they wrote Hinglish).
- Use what you know about the user to interpret messages (e.g. a student's "papa ne 5000 bheje" is Allowance income).
- description is a short clean title ("Lunch at Swiggy"), not the raw text.
- merchant is a named business or brand (Swiggy, DMart, Uber) or null. "auto", "cab", "petrol" alone are not merchants.
- payment_method only if stated (UPI, Credit Card, Debit Card, Net Banking, Cash, Other), else null.
- feedback: one short, warm, practical sentence about what was just recorded, suited to this user and their goals. Be specific to the purchases (name them); never generic praise like "Great, you've tracked your expenses". No numbers or totals (the app adds exact figures and budget warnings). Essentials need only a light touch ("Electricity bill sorted for the month."); for "could trim" or optional spending, give one gentle, concrete idea (e.g. "Two delivery dinners this week — cooking one of them at home would stretch the food budget."). If the context shows a budget is nearly used up for that category, you may gently say so in words. Never preach. null if nothing was recorded.
- answer_category: when the first waiting item needs a category and the message explains what it was for, directly or indirectly, set the best category for that item (an expense category for an expense, an income category for income). People often explain who someone is or why they pay them instead of naming a category, and the explanation can be long:
  - "he is a cousin whose card I used to buy my phone and monitor, so I pay him the EMI" -> Financial Obligations
  - "that's my mom's account, my dad uses it and I pay his loan EMI" -> Financial Obligations
  - "my landlord" -> Housing & Rent; "rapido driver" -> Transportation; "doodhwala" -> Groceries; "sent to my sister for her birthday" -> Gifts & Donations
  In that case don't also return the waiting item in items. Otherwise answer_category is null.
- rule_payee / rule_category: when the user wants every payment to or from someone filed one way, or tells you what a payee is ("map all Prince Kumar payments to travel", "Prince Kumar is my rapido driver", "sab Blinkit wale groceries mein daalo", "anything to Ravi is rent"), set rule_payee to the name exactly as they wrote it (typos included) and rule_category to the best category. Then items is [] unless they also list new purchases with amounts, and reply is a short "Done." in their language. Otherwise both are null.
- If the message contains no transaction (a greeting, thanks, a question about their spending), return items [] and answer in reply in one or two short sentences; for questions about their spending, suggest the "Ask for advice" page.
- Otherwise reply is a brief acknowledgement without numbers, e.g. "Got it." in the user's language.`;
}

// --- Amount guard -----------------------------------------------------------
// Models sometimes copy one item's amount onto another, or invent one. Every
// amount must match a number the user actually wrote, used once, and closest
// to that item's words; anything else becomes a question instead.

const QUANTITY_UNITS = /^\s*(?:kg|g|gm|grams?|l|ltr|litres?|liters?|ml|km|pcs|pieces|people|persons?|log|dozen|baje|am|pm|x|%)\b/i;
const NUMBER_WORDS = /\b(sau|so|hazaar|hazar|hundred|thousand|lakh|lac|crore|ek|do|teen|char|paanch|das|bees|pachas)\b/i;

function normalizeDigits(text: string): string {
	return text.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
}

function moneyMentions(text: string): { value: number; index: number }[] {
	const out: { value: number; index: number }[] = [];
	for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|lakh|lac)?\b/gi)) {
		const after = text.slice((m.index ?? 0) + m[0].length);
		if (!m[2] && QUANTITY_UNITS.test(after)) continue;
		const base = parseFloat(m[1].replace(/,/g, ''));
		const unit = m[2]?.toLowerCase();
		const value = unit === 'k' ? base * 1000 : unit ? base * 100000 : base;
		if (Number.isFinite(value) && value > 0) out.push({ value, index: m.index ?? 0 });
	}
	return out;
}

function anchorIndex(text: string, item: EntryItem): number {
	const lower = text.toLowerCase();
	const words = [item.merchant ?? '', ...item.description.split(/\s+/)]
		.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
		.filter((w) => w.length >= 3);
	const hits = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
	return hits.length ? Math.min(...hits) : -1;
}

function askForAmount(item: EntryItem): EntryItem {
	return {
		...item,
		amount: null,
		needs: 'amount',
		question: `How much was the ${item.description.toLowerCase()}?`,
		options: [],
	};
}

function guardAmounts(items: EntryItem[], message: string): EntryItem[] {
	const text = normalizeDigits(message);
	if (!/\d/.test(text)) {
		// Amounts in words ("paanch sau") are fine; otherwise nothing was stated.
		return NUMBER_WORDS.test(text) ? items : items.map((i) => (i.amount === null ? i : askForAmount(i)));
	}
	const mentions = moneyMentions(text);
	const used = new Set<number>();
	const result = items.map((i) => ({ ...i }));

	// Closest item to each mention wins it; leftovers are asked for.
	const claims = result
		.map((item, idx) => ({ item, idx, anchor: anchorIndex(text, item) }))
		.filter((c) => c.item.amount !== null);
	const scored = claims.flatMap((c) =>
		mentions
			.map((m, mIdx) => ({ c, mIdx, m }))
			.filter(({ m }) => Math.abs(m.value - (c.item.amount as number)) < 0.01)
			.map(({ c, mIdx, m }) => ({ idx: c.idx, mIdx, distance: c.anchor < 0 ? 10_000 : Math.abs(c.anchor - m.index) }))
	);
	scored.sort((a, b) => a.distance - b.distance);
	const assigned = new Set<number>();
	for (const s of scored) {
		if (assigned.has(s.idx) || used.has(s.mIdx)) continue;
		assigned.add(s.idx);
		used.add(s.mIdx);
	}
	return result.map((item, idx) => (item.amount === null || assigned.has(idx) ? item : askForAmount(item)));
}

/** Parsed JSON-mode reply, whichever response shape the model family uses. */
function structuredOutput(result: unknown): unknown {
	const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
	const raw = r.response ?? r.choices?.[0]?.message?.content;
	if (typeof raw !== 'string') return raw;
	// Some models wrap JSON in a code fence.
	return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

async function handleEntry(request: Request, env: Env): Promise<Response> {
	const model =
		(env.ALLOW_MODEL_OVERRIDE === 'true' && request.headers.get('x-model')) || env.ENTRY_MODEL;
	const body = await readJson<EntryRequest>(request);
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (!message) throw new HttpError(400, 'message is required');
	if (message.length > 1000) throw new HttpError(400, 'message must be at most 1000 characters');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '')) throw new HttpError(400, 'today must be YYYY-MM-DD');
	if (!body.categories?.expense?.length || !body.categories?.income?.length) {
		throw new HttpError(400, 'categories.expense and categories.income are required');
	}
	body.pending = (body.pending ?? []).slice(0, 10);
	body.history = (body.history ?? []).slice(-8).map((h) => ({ role: h.role, content: String(h.content).slice(0, 400) }));

	const result = await env.AI.run(model as typeof env.ENTRY_MODEL, {
		messages: [
			{ role: 'system', content: entryPrompt(body) },
			{ role: 'user', content: message },
		],
		response_format: { type: 'json_schema', json_schema: entrySchema(body.categories) },
		temperature: 0.1,
		max_tokens: 1500,
	});

	const data = structuredOutput(result) as { items?: EntryItem[]; reply?: string; feedback?: string | null } | null;
	if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
		throw new HttpError(502, 'Model returned no structured output');
	}
	data.items = guardAmounts(
		data.items.map((i) => ({ ...i, options: Array.isArray(i.options) ? i.options : [], needs: i.needs ?? null })),
		message
	);
	return json({ data, model });
}

// ---------------------------------------------------------------------------
// Photos: bills, receipts, price tags, products -> transactions (Llama 4 Scout vision)
// ---------------------------------------------------------------------------

interface ReceiptRequest {
	/** Base64 image, no data: prefix. */
	image: string;
	mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
	/** Optional caption the user typed with the photo. */
	note?: string;
	today: string;
	timezone?: string;
	categories: { expense: string[]; income: string[] };
	profile?: EntryProfile;
	context?: EntryContext;
}

const MAX_IMAGE_BASE64 = 4 * 1024 * 1024;

function receiptSchema(categories: EntryRequest['categories']) {
	const schema = entrySchema(categories);
	const item = schema.properties.items.items;
	return {
		...schema,
		properties: {
			...schema.properties,
			items: {
				...schema.properties.items,
				items: {
					...item,
					properties: {
						...item.properties,
						total_label: {
							type: ['string', 'null'],
							description: 'The exact printed label next to the amount you used ("GRAND TOTAL", "Net Amount", "MRP"), or null',
						},
						split_between: {
							type: 'integer',
							minimum: 1,
							description: 'How many people shared this bill, including the user (1 if not split)',
						},
					},
					required: [...item.required, 'total_label', 'split_between'],
				},
			},
			seen: { type: 'string', description: 'One short line describing what the photo shows' },
		},
		required: [...schema.required, 'seen'],
	};
}

function receiptPrompt(req: ReceiptRequest): string {
	return `You look at a photo someone took to record spending: usually a bill, receipt, invoice, UPI/payment screenshot, price tag or the item itself. Turn it into transactions.
${profileLines(req.profile)}

Today is ${req.today} (${req.timezone ?? 'Asia/Kolkata'}). Default currency INR.
Expense categories: ${req.categories.expense.join(', ')}.
Income categories: ${req.categories.income.join(', ')}.
${req.note ? `The user added this note with the photo: "${req.note}". Follow it (e.g. "paid half" means half the total; "this was yesterday" sets the date).` : ''}
${req.context ? `Spending so far this month (context for feedback only): ${JSON.stringify(req.context)}` : ''}

Rules:
- A bill, receipt or invoice is ONE transaction for the final amount actually paid (grand total after tax, service charge and discounts), not one per line item. If the photo shows several separate bills, one transaction each.
- description: short and human, naming what it was and where ("Dinner at Toit", "Groceries at DMart", "Petrol at Indian Oil"). merchant: the business name printed on the bill, else null.
- purchase_date: the date printed on the bill as YYYY-MM-DD; if none is visible, today.
- payment_method only if printed (UPI, Credit Card, Debit Card, Cash, Net Banking, Other), else null.
- category and essentiality from the merchant and the items (restaurant -> Food & Dining, supermarket -> Groceries, pharmacy -> Healthcare, fuel -> Transportation, electronics/clothes -> Shopping, electricity/phone bill -> Utilities ...). Restaurants, cafes and bars are "optimizable", or "discretionary" for a night out with drinks; groceries, medicine and bills are "essential".
- amount: copy the final total exactly as printed, and put the label printed next to it in total_label ("GRAND TOTAL", "Total", "Net Amount", "Amount Paid", "MRP" ...). Never add up lines or calculate a total yourself. If no final total is visible or readable (blurry, cut off, covered), amount and total_label are null and needs is "amount" with a question like "I couldn't see the total on the DMart bill. How much did you pay?".
- split_between: if the note says the bill was split, the number of people sharing it including the user ("with 2 friends" = 3, "split with my wife" = 2); otherwise 1. Keep amount as the full printed total; the app works out the share.
- A photo of an item or a price tag: one transaction describing the item. Use the price only if a price is clearly visible; otherwise amount null and ask "How much did you pay for the headphones?".
- needs "category" only if you truly can't tell what kind of purchase it is; then options lists 2-4 likely categories copied exactly from the lists above.
- If the photo has nothing to do with spending, return items [] and use reply to ask kindly for a photo of the bill or the item.
- seen: one short line on what the photo shows ("Restaurant bill from Toit, 4 items, total ₹1,850").
- reply: a brief friendly acknowledgement. feedback: one short, specific, warm sentence about the purchase, no numbers (or null).`;
}

async function handleReceipt(request: Request, env: Env): Promise<Response> {
	const model =
		(env.ALLOW_MODEL_OVERRIDE === 'true' && request.headers.get('x-model')) || env.ENTRY_MODEL;
	const body = await readJson<ReceiptRequest>(request);
	if (typeof body.image !== 'string' || body.image.length < 100) throw new HttpError(400, 'image is required');
	if (body.image.length > MAX_IMAGE_BASE64) throw new HttpError(413, 'That photo is too large.');
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(body.mimeType)) {
		throw new HttpError(400, 'Photo must be JPEG, PNG or WebP');
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '')) throw new HttpError(400, 'today must be YYYY-MM-DD');
	if (!body.categories?.expense?.length || !body.categories?.income?.length) {
		throw new HttpError(400, 'categories.expense and categories.income are required');
	}
	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

	const result = await env.AI.run(model as typeof env.ENTRY_MODEL, {
		messages: [
			{ role: 'system', content: receiptPrompt({ ...body, note }) },
			{
				role: 'user',
				content: [
					{ type: 'text', text: note || 'Record what this photo shows.' },
					{ type: 'image_url', image_url: { url: `data:${body.mimeType};base64,${body.image}` } },
				],
			},
		],
		response_format: { type: 'json_schema', json_schema: receiptSchema(body.categories) },
		temperature: 0,
		max_tokens: 1500,
	});

	const data = structuredOutput(result) as
		| { items?: EntryItem[]; reply?: string; feedback?: string | null; seen?: string }
		| null;
	if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
		throw new HttpError(502, 'Model returned no structured output');
	}
	data.items = (data.items as (EntryItem & { total_label?: string | null; split_between?: number })[]).map((i) => {
		const { total_label, split_between, ...rest } = i;
		const item: EntryItem = { ...rest, options: Array.isArray(rest.options) ? rest.options : [], needs: rest.needs ?? null };
		// A total we can't trust (no printed total line, or out of range) becomes a question.
		if (item.amount !== null && (!total_label || !(item.amount > 0 && item.amount < 1e8))) {
			return { ...askForAmount(item), question: `I couldn't see the final total on this bill. How much did you pay for ${item.description.toLowerCase()}?` };
		}
		if (item.amount === null) return item.needs === null ? askForAmount(item) : item;
		// Splits are arithmetic, so they happen here rather than in the model.
		const people = Number.isInteger(split_between) && (split_between as number) > 1 ? (split_between as number) : 1;
		if (people > 1) {
			const total = item.amount;
			return {
				...item,
				amount: Math.round((total / people) * 100) / 100,
				description: `${item.description} (your share of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(total)})`,
			};
		}
		return item;
	});
	return json({ data, model });
}

// ---------------------------------------------------------------------------
// Bank statement import: PDF / spreadsheet / CSV -> transactions
// ---------------------------------------------------------------------------

interface StatementRequest {
	/** Base64 file contents, no data: prefix. */
	file: string;
	filename: string;
	today: string;
	categories: { expense: string[]; income: string[] };
	profile?: EntryProfile;
}

const MAX_STATEMENT_BASE64 = 8 * 1024 * 1024;
const STATEMENT_CHUNK_CHARS = 6000;
const MAX_STATEMENT_CHUNKS = 16;

function statementSchema(categories: EntryRequest['categories']) {
	const entry = entrySchema(categories).properties.items.items;
	const { ref: _ref, purchase_date: _date, ...rest } = entry.properties;
	return {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				maxItems: 80,
				items: {
					type: 'object',
					properties: {
						date: { type: 'string', description: 'Transaction date as YYYY-MM-DD' },
						...rest,
					},
					required: entry.required.filter((k) => k !== 'ref' && k !== 'purchase_date').concat('date'),
				},
			},
		},
		required: ['items'],
	};
}

function statementPrompt(req: StatementRequest): string {
	return `You read part of a bank, credit card or wallet statement and list every transaction row in it.
${profileLines(req.profile)}
Today is ${req.today}. Statement dates may be written like 05/10/2026, 05-Oct-26 or 5 Oct; convert them to YYYY-MM-DD (assume day/month order, as in India).

Expense categories: ${req.categories.expense.join(', ')}.
Income categories: ${req.categories.income.join(', ')}.

Rules:
- One item per transaction row, including every credit (salary, refunds, transfers in). Skip headers, opening/closing balances, totals, interest summaries and page footers.
- Debit / withdrawal / Dr = expense. Credit / deposit / Cr = income. amount is always positive and must be copied exactly from the row (ignore the running balance column).
- Skip transfers between the user's own accounts and credit card bill payments (they would double count spending).
- description: a short, human title for the payee or purpose, e.g. "UPI/DR/412345/SWIGGY/YESB/..." -> "Swiggy order", "NEFT CR-ACME TECH-SALARY OCT" -> "Salary from Acme Tech", "ATM WDL" -> "Cash withdrawal".
- merchant: the payee business name (Swiggy, Amazon, Indian Oil) or null for people and banks.
- category by vendor: Swiggy/Zomato/restaurants -> Food & Dining; Blinkit/Zepto/BigBasket/DMart -> Groceries; Uber/Ola/Rapido/IRCTC/metro/fuel stations -> Transportation; Netflix/Spotify/Prime/Hotstar -> Subscriptions; electricity, gas, broadband, mobile recharge -> Utilities; rent -> Housing & Rent; pharmacies/hospitals -> Healthcare; Amazon/Flipkart/Myntra -> Shopping; salary credits -> Salary; refunds/cashback -> Other Income; ATM withdrawals -> Miscellaneous.
- essentiality as usual (essential / optimizable / discretionary; "essential" for income).
- needs "category" only when the row is a payment to a person or unclear (e.g. "UPI to RAHUL K", "IMPS 9876xxxx"): question asks what it was for, in plain words, mentioning the amount and date (e.g. "What was the ₹500 to Rahul on 12 Oct for?"), and options lists 2-4 likely categories copied exactly from the lists above. Otherwise needs, question are null and options is [].
- payment_method: UPI, Debit Card, Credit Card, Net Banking (NEFT/IMPS/RTGS), Cash (ATM) or Other.`;
}

function splitIntoChunks(text: string): string[] {
	const chunks: string[] = [];
	let current = '';
	for (const line of text.split('\n')) {
		if (current.length + line.length + 1 > STATEMENT_CHUNK_CHARS && current) {
			chunks.push(current);
			current = '';
		}
		current += `${line}\n`;
	}
	if (current.trim()) chunks.push(current);
	return chunks;
}

/** Minimal CSV parser (quoted fields, commas, newlines). */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if (field || row.length) rows.push([...row, field]);
	return rows.filter((r) => r.some((f) => f.trim()));
}

/** CSV rows as "Header: value | ..." lines, so empty debit/credit columns can't be misread. */
function csvToLines(text: string): string {
	const rows = parseCsv(text);
	const headerIndex = rows.findIndex((r) => r.some((f) => /date/i.test(f)));
	if (headerIndex < 0) return text;
	const header = rows[headerIndex].map((h) => h.trim());
	return rows
		.slice(headerIndex + 1)
		.map((r) =>
			r
				.map((v, i) => [header[i] || `Column ${i + 1}`, v.trim()])
				.filter(([, v]) => v)
				.map(([h, v]) => `${h}: ${v}`)
				.join(' | ')
		)
		.join('\n');
}

const MIME_BY_EXT: Record<string, string> = {
	pdf: 'application/pdf',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	xls: 'application/vnd.ms-excel',
	ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

async function statementText(req: StatementRequest, env: Env): Promise<string> {
	return statementTextFromBytes(Uint8Array.from(atob(req.file), (c) => c.charCodeAt(0)), req.filename, env);
}

async function statementTextFromBytes(bytes: Uint8Array, filename: string, env: Env): Promise<string> {
	const req = { filename };
	const ext = req.filename.toLowerCase().split('.').pop() ?? '';
	if (ext === 'csv') return csvToLines(new TextDecoder().decode(bytes));
	if (ext === 'txt') return new TextDecoder().decode(bytes);

	const result = await env.AI.toMarkdown({
		name: req.filename,
		blob: new Blob([bytes], { type: MIME_BY_EXT[ext] ?? 'application/octet-stream' }),
	});
	const doc = Array.isArray(result) ? result[0] : result;
	if (!doc || doc.format === 'error' || !doc.data) {
		const reason = doc && 'error' in doc ? String(doc.error) : 'unknown error';
		throw new HttpError(
			422,
			/password|encrypt/i.test(reason)
				? 'This file is password-protected. Open it in your bank app, save an unlocked copy (or export as CSV/Excel) and upload that.'
				: `Couldn't read this file (${reason}). Try a PDF, Excel or CSV export from your bank.`
		);
	}
	return doc.data;
}

type StatementRow = EntryItem & { date: string; time?: string | null; payee?: string };

const INTERNAL_TRANSFER =
	/bill payment of .*credit ?card|upi lite top.?up|credit ?card (bill|payment)|\bcc (payment|autopay|bill)|card (bill|autopay)|own a\/?c|self transfer|transfer to own/i;

/** Reads one part of a statement. Throws on model errors so callers can retry. */
async function extractStatementChunk(
	env: Env,
	model: string,
	system: string,
	schema: ReturnType<typeof statementSchema>,
	chunk: string
): Promise<StatementRow[]> {
	const out = await env.AI.run(model as typeof env.ENTRY_MODEL, {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: chunk },
		],
		response_format: { type: 'json_schema', json_schema: schema },
		temperature: 0,
		max_tokens: 6000,
	});
	const data = structuredOutput(out) as { items?: StatementRow[] } | null;
	// Keep only rows whose amount really appears in this part of the statement.
	const mentions = moneyMentions(chunk).map((m) => m.value);
	return (data?.items ?? []).filter(
		(it) =>
			typeof it.amount === 'number' &&
			it.amount > 0 &&
			/^\d{4}-\d{2}-\d{2}$/.test(it.date) &&
			mentions.some((v) => Math.abs(v - (it.amount as number)) < 0.01)
	);
}

/** Drops own-account transfers / card bill payments (they double count) and normalises fields. */
function cleanStatementRows(rows: StatementRow[]): StatementRow[] {
	return rows
		.filter((it) => !INTERNAL_TRANSFER.test(`${it.description} ${it.merchant ?? ''}`))
		.map((it) => ({ ...it, options: Array.isArray(it.options) ? it.options : [], needs: it.needs === 'category' ? 'category' : null }));
}

/**
 * Splits statement text into readable parts, page by page when the converter
 * marked pages ("### Page 3"), and further splits very long pages.
 */
function splitIntoPages(text: string): { label: string; text: string }[] {
	const marked = text.split(/^#{1,4}\s*Page\s+(\d+)\s*$/im);
	const pages: { label: string; text: string }[] = [];
	if (marked.length > 2) {
		for (let i = 1; i < marked.length; i += 2) {
			const parts = splitIntoChunks(marked[i + 1] ?? '');
			parts.forEach((part, j) =>
				pages.push({ label: parts.length > 1 ? `page ${marked[i]} (part ${j + 1})` : `page ${marked[i]}`, text: part })
			);
		}
	} else {
		splitIntoChunks(text).forEach((part, i, all) => pages.push({ label: all.length > 1 ? `part ${i + 1}` : 'the statement', text: part }));
	}
	return pages.filter((p) => p.text.trim().length > 20);
}

// ---------------------------------------------------------------------------
// Rule-based statements: rows come from the file itself (exact amounts and
// direction); the model only sorts payee names into categories, and only
// people / unclear payees with real money involved become questions.
// ---------------------------------------------------------------------------

type Essentiality = EntryItem['essentiality'];
interface PayeeGroup {
	key: string;
	payee: string;
	type: 'expense' | 'income';
	note: string | null;
	count: number;
	total: number;
}
interface PayeeVerdict {
	kind: 'business' | 'person' | 'unclear';
	category: string;
	essentiality: Essentiality;
	confidence: number;
	options: string[];
	/** From the user's own earlier answers; never asked again. */
	learned?: boolean;
}

const PAYEE_BATCH = 50;
/** Smaller amounts to people (tea stalls, auto drivers on personal UPI) aren't worth a question. */
const ASK_MIN_TOTAL = 500;

function payeeKey(type: string, payee: string): string {
	return `${type}|${payee.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
}

function groupPayees(rows: ParsedStatementRow[]): PayeeGroup[] {
	const groups = new Map<string, PayeeGroup>();
	for (const r of rows) {
		if (r.internal) continue;
		const key = payeeKey(r.transaction_type, r.payee);
		const g = groups.get(key) ?? { key, payee: r.payee, type: r.transaction_type, note: r.note, count: 0, total: 0 };
		g.count++;
		g.total += r.amount;
		g.note ??= r.note;
		groups.set(key, g);
	}
	return [...groups.values()].sort((a, b) => b.total - a.total);
}

function payeeSchema(categories: { expense: string[]; income: string[] }) {
	return {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						i: { type: 'integer', description: 'The payee number' },
						kind: { type: 'string', enum: ['business', 'person', 'unclear'] },
						category: { type: 'string', enum: [...categories.expense, ...categories.income] },
						essentiality: { type: 'string', enum: ['essential', 'optimizable', 'discretionary'] },
						confidence: { type: 'number', minimum: 0, maximum: 1 },
						options: { type: 'array', maxItems: 4, items: { type: 'string' } },
					},
					required: ['i', 'kind', 'category', 'essentiality', 'confidence', 'options'],
				},
			},
		},
		required: ['items'],
	};
}

function payeePrompt(categories: { expense: string[]; income: string[] }, profile: EntryProfile | undefined): string {
	return `You sort the payees of an Indian bank / UPI statement into categories. Each line is one payee: "N. paid to <name>" or "N. received from <name>", sometimes with a note, the number of payments and the total.
${profileLines(profile)}
Expense categories: ${categories.expense.join(', ')}.
Income categories: ${categories.income.join(', ')}.

For every numbered payee return one item with the same number i:
- kind: "business" for shops, apps, brands, companies, billers and merchants (Zomato, Blinkit, Airtel, "Mukul kirana Store", "Milan enterprises", "Sharma Medicos"); "person" for an individual's name ("Neetu Singh", "Prince Kumar"); "unclear" otherwise.
- category: for "paid to" use an expense category, for "received from" an income category. Businesses by what they sell: kirana / general / dairy / vegetable stores, Blinkit, Zepto, BigBasket -> Groceries; Zomato, Swiggy, restaurants, cafes, sweets -> Food & Dining; Uber, Ola, Rapido, fuel, metro, IRCTC, FASTag -> Transportation; mobile / DTH recharge, electricity, gas, broadband -> Utilities; chemists, hospitals, labs -> Healthcare; Amazon, Flipkart, Myntra, clothing, electronics -> Shopping; salons -> Personal Care; Netflix, Spotify, Google Play -> Subscriptions; loan EMIs, insurance -> Financial Obligations. Refunds / cashback received from a business -> Other Income. People: your best guess, usually Miscellaneous (paid) or Other Income (received); use the note when it says what it was for.
- essentiality: essential (groceries, bills, rent, health, transport to work), optimizable (could be cheaper), discretionary (wants). For income use "essential".
- confidence: 0-1, how sure you are of the category. People without a helpful note: 0.3 or less.
- options: for people and unclear payees, 3-4 likely categories of the right type, copied exactly from the lists. Otherwise [].`;
}

async function sortPayees(
	env: Env,
	model: string,
	groups: PayeeGroup[],
	categories: { expense: string[]; income: string[] },
	profile: EntryProfile | undefined
): Promise<Map<string, PayeeVerdict>> {
	const lines = groups.map(
		(g, i) =>
			`${i + 1}. ${g.type === 'income' ? 'received from' : 'paid to'} ${g.payee}${g.note ? ` (note: ${g.note})` : ''} - ${g.count} ${g.count === 1 ? 'payment' : 'payments'}, Rs ${Math.round(g.total)}`
	);
	const out = await env.AI.run(model as typeof env.ENTRY_MODEL, {
		messages: [
			{ role: 'system', content: payeePrompt(categories, profile) },
			{ role: 'user', content: lines.join('\n') },
		],
		response_format: { type: 'json_schema', json_schema: payeeSchema(categories) },
		temperature: 0,
		max_tokens: 6000,
	});
	const data = structuredOutput(out) as { items?: (PayeeVerdict & { i: number })[] } | null;
	const verdicts = new Map<string, PayeeVerdict>();
	for (const v of data?.items ?? []) {
		const g = groups[v.i - 1];
		if (!g) continue;
		const allowed = g.type === 'income' ? categories.income : categories.expense;
		const category = allowed.find((c) => c.toLowerCase() === String(v.category).toLowerCase());
		verdicts.set(g.key, {
			kind: v.kind === 'business' || v.kind === 'person' ? v.kind : 'unclear',
			category: category ?? (g.type === 'income' ? 'Other Income' : 'Miscellaneous'),
			essentiality: g.type === 'income' ? 'essential' : (['essential', 'optimizable', 'discretionary'].includes(v.essentiality) ? v.essentiality : 'optimizable'),
			confidence: category ? Math.min(1, Math.max(0, Number(v.confidence) || 0)) : 0,
			options: (Array.isArray(v.options) ? v.options : []).filter((o) => allowed.includes(o)).slice(0, 4),
		});
	}
	return verdicts;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Turns parsed rows + payee verdicts into rows to save; questions are written here, not by the model. */
function rowsFromParsed(parsed: ParsedStatementRow[], groups: PayeeGroup[], verdicts: Map<string, PayeeVerdict>): StatementRow[] {
	const byKey = new Map(groups.map((g) => [g.key, g]));
	return parsed
		.filter((r) => !r.internal)
		.map((r) => {
			const key = payeeKey(r.transaction_type, r.payee);
			const group = byKey.get(key)!;
			const fallback = r.transaction_type === 'income' ? 'Other Income' : 'Miscellaneous';
			const v = verdicts.get(key) ?? { kind: 'unclear', category: fallback, essentiality: 'optimizable', confidence: 0, options: [] };
			const ask = !v.learned && (v.kind !== 'business' || v.confidence < 0.5) && group.total >= ASK_MIN_TOTAL;
			const [, m, d] = r.date.split('-').map(Number);
			const options = v.options.length ? v.options : [v.category];
			return {
				ref: null,
				date: r.date,
				time: r.time,
				payee: r.payee,
				transaction_type: r.transaction_type,
				amount: r.amount,
				description: r.note ? `${r.payee} · ${r.note}`.slice(0, 120) : r.payee,
				merchant: v.kind === 'business' ? r.payee : null,
				category: v.category,
				purchase_date: r.date,
				payment_method: r.payment_method,
				essentiality: r.transaction_type === 'income' ? 'essential' : v.essentiality,
				confidence: v.confidence,
				needs: ask ? 'category' : null,
				question: ask
					? `What was the ${inr(r.amount)} ${r.transaction_type === 'income' ? 'from' : 'to'} ${r.payee} on ${d} ${SHORT_MONTHS[m - 1]} for?`
					: null,
				options: ask ? options : [],
			} satisfies StatementRow;
		});
}

async function handleStatement(request: Request, env: Env): Promise<Response> {
	const model =
		(env.ALLOW_MODEL_OVERRIDE === 'true' && request.headers.get('x-model')) || env.ENTRY_MODEL;
	const body = await readJson<StatementRequest>(request);
	if (typeof body.file !== 'string' || !body.file) throw new HttpError(400, 'file is required');
	if (body.file.length > MAX_STATEMENT_BASE64) throw new HttpError(413, 'That file is too large (max about 6 MB).');
	if (typeof body.filename !== 'string' || !/\.(pdf|csv|txt|xlsx|xls|ods)$/i.test(body.filename)) {
		throw new HttpError(400, 'Upload a PDF, Excel or CSV statement.');
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '')) throw new HttpError(400, 'today must be YYYY-MM-DD');
	if (!body.categories?.expense?.length || !body.categories?.income?.length) {
		throw new HttpError(400, 'categories.expense and categories.income are required');
	}

	const text = normalizeDigits(await statementText(body, env));
	const parsed = parseStatementText(text);
	if (parsed) {
		const groups = groupPayees(parsed);
		const verdicts = new Map<string, PayeeVerdict>();
		for (let i = 0; i < groups.length; i += PAYEE_BATCH * 4) {
			const batches = await Promise.all(
				[0, 1, 2, 3]
					.map((j) => groups.slice(i + j * PAYEE_BATCH, i + (j + 1) * PAYEE_BATCH))
					.filter((b) => b.length)
					.map((b) =>
						sortPayees(env, model, b, body.categories, body.profile).catch((err) => {
							console.error('Payee batch failed', err);
							return new Map<string, PayeeVerdict>();
						})
					)
			);
			for (const b of batches) for (const [k, v] of b) verdicts.set(k, v);
		}
		return json({
			data: { items: rowsFromParsed(parsed, groups, verdicts) },
			stats: { characters: text.length, rows: parsed.length, mode: 'rules', truncated: false },
			model,
		});
	}
	const chunks = splitIntoChunks(text).slice(0, MAX_STATEMENT_CHUNKS);
	if (!chunks.length) throw new HttpError(422, "That file doesn't seem to contain any text.");

	const system = statementPrompt(body);
	const schema = statementSchema(body.categories);
	const rows: StatementRow[] = [];
	// A few chunks at a time keeps latency down without tripping model rate limits.
	for (let i = 0; i < chunks.length; i += 4) {
		const batch = await Promise.all(
			chunks.slice(i, i + 4).map((chunk) =>
				extractStatementChunk(env, model, system, schema, chunk).catch((err) => {
					console.error('Statement chunk failed', err);
					return [] as StatementRow[];
				})
			)
		);
		rows.push(...batch.flat());
	}

	return json({
		data: { items: cleanStatementRows(rows) },
		stats: { characters: text.length, chunks: chunks.length, truncated: splitIntoChunks(text).length > MAX_STATEMENT_CHUNKS },
		model,
	});
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

interface CoachRequest {
	question: string;
	history?: { role: 'user' | 'assistant'; content: string }[];
	language?: 'en' | 'hinglish';
	/** Figures computed deterministically by the app. The model may only quote these. */
	context: Record<string, unknown>;
}

function coachPrompt(req: CoachRequest): string {
	const language =
		req.language === 'hinglish'
			? 'Reply in natural Hinglish (Hindi in Latin script mixed with English).'
			: 'Reply in clear, plain English.';
	return `You are SpendWise's money coach: calm, direct and practical, like a sharp friend who is good with money.

You get the user's spending figures as JSON. They were calculated exactly by the app.
- Quote figures only from the JSON. Do not add, subtract or estimate new totals yourself.
- If the JSON can't answer the question, say what is missing and suggest what to track.
- Be specific: name categories and amounts. Give at most 3 concrete suggestions.
- Speak plainly: call "optimizable" spending "spending you could trim" and "discretionary" spending "optional spending". Don't put category names in quotes.
- Write money in the user's currency (default INR) with its symbol and local grouping, e.g. ₹6,200 or ₹1,25,000. Never use "$" for INR.
- Keep it under 120 words. Use short paragraphs or a short "- " list. No headings, no tables.
- If the figures include userGoals, connect your advice to those goals where it fits.
- If the figures include userType, fit the advice to their life: students — small, practical steps on a tight allowance; salaried — plan around payday and fixed bills; business owners and freelancers — uneven income, keeping business and personal spending apart, a bigger buffer; homemakers — the household budget; retired — protecting savings and steady costs.
- Use earlier messages in the conversation for context (e.g. "what about last month?").
- You are not a licensed financial adviser; don't recommend specific investments or securities.
${language}

User's figures:
${JSON.stringify(req.context)}`;
}

async function handleCoach(request: Request, env: Env): Promise<Response> {
	const body = await readJson<CoachRequest>(request);
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	if (!question) throw new HttpError(400, 'question is required');
	if (question.length > MAX_INPUT_CHARS) throw new HttpError(400, `question must be at most ${MAX_INPUT_CHARS} characters`);
	if (!body.context || typeof body.context !== 'object') throw new HttpError(400, 'context is required');

	const history = (body.history ?? [])
		.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
		.slice(-MAX_HISTORY_TURNS)
		.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

	const stream = await env.AI.run(env.TEXT_MODEL, {
		messages: [{ role: 'system', content: coachPrompt(body) }, ...history, { role: 'user', content: question }],
		temperature: 0.4,
		max_tokens: 450,
		stream: true,
	});

	return new Response((stream as ReadableStream<Uint8Array>).pipeThrough(sseToText()), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
	});
}

/**
 * Converts the Workers AI SSE stream into a plain stream of reply text, so the
 * app can append chunks as they arrive. Token text is read from the OpenAI-style
 * `choices[0].delta.content`, falling back to `response` (which is sometimes a
 * number when the token is numeric).
 */
function sseToText(): TransformStream<Uint8Array, Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';

	const emitLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
		if (!line.startsWith('data:')) return;
		const payload = line.slice(5).trim();
		if (!payload || payload === '[DONE]') return;
		try {
			const chunk = JSON.parse(payload) as {
				response?: unknown;
				choices?: { delta?: { content?: unknown } }[];
			};
			const delta = chunk.choices?.[0]?.delta?.content;
			const text = typeof delta === 'string' ? delta : chunk.response != null ? String(chunk.response) : '';
			if (text) controller.enqueue(encoder.encode(text));
		} catch {
			// Ignore keep-alives and malformed lines.
		}
	};

	return new TransformStream({
		transform(bytes, controller) {
			buffer += decoder.decode(bytes, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) emitLine(line.trim(), controller);
		},
		flush(controller) {
			emitLine(buffer.trim(), controller);
		},
	});
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

interface TranscribeRequest {
	audio: string; // base64, no data: prefix
	language?: string;
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
	const body = await readJson<TranscribeRequest>(request);
	if (typeof body.audio !== 'string' || body.audio.length === 0) throw new HttpError(400, 'audio is required');
	if (body.audio.length > MAX_AUDIO_BASE64_CHARS) throw new HttpError(413, 'Recording is too long');

	const result = await env.AI.run(env.SPEECH_MODEL, {
		audio: body.audio,
		...(body.language ? { language: body.language } : {}),
		initial_prompt: 'An expense or income note, e.g. "Paid 450 rupees for lunch on Swiggy" or "kal 1200 ka petrol".',
	});

	return json({ text: (result.text ?? '').trim() });
}

// ---------------------------------------------------------------------------

export default {
	async fetch(request, env): Promise<Response> {
		const { pathname } = new URL(request.url);

		try {
			if (request.method === 'GET' && pathname === '/health') {
				return json({ ok: true });
			}

			if (!pathname.startsWith('/v1/')) throw new HttpError(404, 'Not found');
			if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');

			const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
			if (!env.API_SECRET || !safeEqual(token, env.API_SECRET)) throw new HttpError(401, 'Unauthorized');

			const clientId = request.headers.get('x-client-id') || 'anonymous';
			const { success } = await env.RATE_LIMITER.limit({ key: clientId });
			if (!success) throw new HttpError(429, 'Too many AI requests. Please wait a minute and try again.');

			switch (pathname) {
				case '/v1/entry':
					return await handleEntry(request, env);
				case '/v1/statement':
					return await handleStatement(request, env);
				case '/v1/receipt':
					return await handleReceipt(request, env);
				case '/v1/jobs/statement':
					return await handleStartStatementJob(request, env);
				case '/v1/extract':
					return await handleExtract(request, env);
				case '/v1/coach':
					return await handleCoach(request, env);
				case '/v1/transcribe':
					return await handleTranscribe(request, env);
				default:
					throw new HttpError(404, 'Not found');
			}
		} catch (err) {
			if (err instanceof HttpError) return json({ error: err.message }, err.status);
			console.error('Unhandled error', pathname, err);
			return json({ error: 'AI request failed' }, 502);
		}
	},
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Background statement imports: a Cloudflare Workflow per import_jobs row.
// The app stores the file in R2 and the job in D1, then calls /v1/jobs/statement.
// Each step is durable and retried; progress and a readable log go to D1 so the
// chat can show what's happening, and the import finishes even if the user leaves.
// ---------------------------------------------------------------------------

type ImportParams = { jobId: string };
type CategoryRow = { id: string; name: string; category_type: 'expense' | 'income' };

const MAX_JOB_PAGES = 60;

async function logJob(env: Env, jobId: string, text: string, fields: Record<string, string | number | null> = {}) {
	const keys = Object.keys(fields);
	await env.DB.prepare(
		`UPDATE import_jobs SET ${keys.map((k) => `${k} = ?, `).join('')}
		   events = json_insert(events, '$[#]', json_object('at', ?, 'text', ?)),
		   updated_at = ?
		 WHERE id = ?`
	)
		.bind(...keys.map((k) => fields[k]), new Date().toISOString(), text, new Date().toISOString(), jobId)
		.run();
}

async function handleStartStatementJob(request: Request, env: Env): Promise<Response> {
	const { jobId } = await readJson<{ jobId?: string }>(request);
	if (!jobId || typeof jobId !== 'string') throw new HttpError(400, 'jobId is required');
	const job = await env.DB.prepare('SELECT id FROM import_jobs WHERE id = ?').bind(jobId).first();
	if (!job) throw new HttpError(404, 'Job not found');
	await env.STATEMENT_IMPORT.create({ id: jobId, params: { jobId } });
	return json({ ok: true });
}

export class StatementImportWorkflow extends WorkflowEntrypoint<Env, ImportParams> {
	async run(event: WorkflowEvent<ImportParams>, step: WorkflowStep) {
		const { jobId } = event.payload;
		const env = this.env;
		try {
			const setup = await step.do('load job', async () => {
				const job = await env.DB.prepare(
					`SELECT j.user_id, j.filename, j.r2_key, u.user_type, u.monthly_income, u.main_goals
					 FROM import_jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ?`
				)
					.bind(jobId)
					.first<{ user_id: string; filename: string; r2_key: string; user_type: string | null; monthly_income: number | null; main_goals: string }>();
				if (!job) throw new Error('Import job not found');
				const { results } = await env.DB.prepare(
					'SELECT id, name, category_type FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY is_system DESC, rowid'
				)
					.bind(job.user_id)
					.all<CategoryRow>();
				// What this user told us before about a payee, so we don't ask twice.
				const { results: answered } = await env.DB.prepare(
					`SELECT t.transaction_type, t.description, t.merchant, t.essentiality, t.ai_extraction, c.name AS category
					 FROM transactions t JOIN categories c ON c.id = t.category_id
					 WHERE t.user_id = ? AND t.user_corrected_classification = 1 ORDER BY t.rowid DESC LIMIT 2000`
				)
					.bind(job.user_id)
					.all<{ transaction_type: string; description: string; merchant: string | null; essentiality: Essentiality; ai_extraction: string | null; category: string }>();
				const learned: Record<string, { category: string; essentiality: Essentiality }> = {};
				for (const a of answered) {
					let payee: string | undefined;
					try {
						payee = (JSON.parse(a.ai_extraction ?? '{}') as { payee?: string }).payee;
					} catch {}
					const key = payeeKey(a.transaction_type, payee ?? tidyPayee(a.merchant || a.description));
					learned[key] ??= { category: a.category, essentiality: a.essentiality };
				}
				await logJob(env, jobId, `Started reading ${job.filename}`, { status: 'reading' });
				return { ...job, categories: results, learned };
			});

			const file = await step.do('read file', { retries: { limit: 2, delay: '5 seconds' } }, async () => {
				const object = await env.STATEMENTS.get(setup.r2_key);
				if (!object) throw new Error('The uploaded file is missing');
				const bytes = new Uint8Array(await object.arrayBuffer());
				let text: string;
				try {
					text = normalizeDigits(await statementTextFromBytes(bytes, setup.filename, env));
				} catch (err) {
					// Password-protected / unreadable files won't get better with retries.
					throw new NonRetryableError(err instanceof Error ? err.message : 'Could not read the file');
				}
				const pageCount = splitIntoPages(text).length;
				const parsed = parseStatementText(text);
				if (parsed) {
					const moved = parsed.filter((r) => r.internal).length;
					await logJob(
						env,
						jobId,
						`Found ${parsed.length} transactions on ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}, read exactly from the file${moved ? ` (${moved} are card bills or wallet top-ups, which I'll leave out so nothing counts twice)` : ''}`,
						{ status: 'extracting' }
					);
					return { parsed, pages: [] as { label: string; text: string }[] };
				}
				const all = splitIntoPages(text);
				const pages = all.slice(0, MAX_JOB_PAGES);
				await logJob(
					env,
					jobId,
					`Converted to text: ${pages.length} ${pages.length === 1 ? 'part' : 'parts'} to read${all.length > pages.length ? ` (first ${MAX_JOB_PAGES} only)` : ''}`,
					{ status: 'extracting', total_pages: pages.length }
				);
				return { parsed: null, pages };
			});
			const { parsed, pages } = file;
			if (!parsed && pages.length === 0) throw new NonRetryableError("That file doesn't seem to contain any text.");

			const categoryNames = {
				expense: setup.categories.filter((c) => c.category_type === 'expense').map((c) => c.name),
				income: setup.categories.filter((c) => c.category_type === 'income').map((c) => c.name),
			};
			const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
			const profile: EntryProfile = {
				userType: setup.user_type,
				monthlyIncome: setup.monthly_income,
				goals: JSON.parse(setup.main_goals || '[]'),
			};
			const system = statementPrompt({ file: '', filename: setup.filename, today, categories: categoryNames, profile });
			const schema = statementSchema(categoryNames);

			const rows: StatementRow[] = [];
			if (parsed) {
				const groups = groupPayees(parsed);
				const verdicts = new Map<string, PayeeVerdict>();
				for (const g of groups) {
					const known = setup.learned[g.key];
					if (known) verdicts.set(g.key, { kind: 'person', category: known.category, essentiality: known.essentiality, confidence: 1, options: [], learned: true });
				}
				const toSort = groups.filter((g) => !verdicts.has(g.key));
				const batches = Math.ceil(toSort.length / PAYEE_BATCH);
				if (verdicts.size) await logJob(env, jobId, `Used your earlier answers for ${verdicts.size} ${verdicts.size === 1 ? 'payee' : 'payees'}`);
				await step.do('plan payees', async () => {
					await logJob(env, jobId, `Sorting ${toSort.length} payees into categories`, { total_pages: batches, pages_done: 0 });
				});
				for (let b = 0; b < batches; b++) {
					const batch = toSort.slice(b * PAYEE_BATCH, (b + 1) * PAYEE_BATCH);
					const sorted = await step.do(
						`sort payees ${b + 1}`,
						{ retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
						async () => {
							const result = await sortPayees(env, env.ENTRY_MODEL, batch, categoryNames, profile);
							const examples = batch
								.filter((g) => result.get(g.key)?.kind === 'business')
								.slice(0, 3)
								.map((g) => `${g.payee} → ${result.get(g.key)!.category}`);
							const people = batch.filter((g) => result.get(g.key)?.kind === 'person').length;
							await logJob(
								env,
								jobId,
								`Sorted payees ${b * PAYEE_BATCH + 1}–${b * PAYEE_BATCH + batch.length} of ${toSort.length}${examples.length ? `: ${examples.join(', ')}` : ''}${people ? ` · ${people} ${people === 1 ? 'is a person' : 'are people'}` : ''}`,
								{ pages_done: b + 1 }
							);
							return [...result.entries()];
						}
					);
					for (const [k, v] of sorted) verdicts.set(k, v);
				}
				rows.push(...rowsFromParsed(parsed, groups, verdicts));
			}
			for (let i = 0; i < pages.length; i++) {
				const found = await step.do(
					`read ${pages[i].label}`,
					{ retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
					async () => {
						const items = cleanStatementRows(await extractStatementChunk(env, env.ENTRY_MODEL, system, schema, pages[i].text));
						const spent = items.filter((r) => r.transaction_type === 'expense').length;
						const earned = items.length - spent;
						await logJob(
							env,
							jobId,
							`Read ${pages[i].label} of ${pages.length}: ${items.length} ${items.length === 1 ? 'transaction' : 'transactions'}${items.length ? ` (${spent} spent, ${earned} received)` : ''}`,
							{ pages_done: i + 1 }
						);
						return items;
					}
				);
				rows.push(...found);
			}

			await step.do('check duplicates and save', { retries: { limit: 3, delay: '5 seconds' } }, async () => {
				if (rows.length === 0) {
					await logJob(env, jobId, 'No transactions found in this file.', { status: 'done', found: 0 });
					return;
				}
				const dates = rows.map((r) => r.date).sort();
				const shift = (d: string, days: number) => {
					const [y, m, dd] = d.split('-').map(Number);
					return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10);
				};
				const { results: existing } = await env.DB.prepare(
					`SELECT t.id, t.transaction_type, t.amount, t.purchase_date, t.description, t.merchant, t.category_id
					 FROM transactions t WHERE t.user_id = ? AND t.purchase_date BETWEEN ? AND ? AND (t.import_job_id IS NULL OR t.import_job_id != ?)`
				)
					.bind(setup.user_id, shift(dates[0], -3), shift(dates[dates.length - 1], 3), jobId)
					.all<{ id: string; transaction_type: 'expense' | 'income'; amount: number; purchase_date: string; description: string; merchant: string | null; category_id: string }>();
				await logJob(env, jobId, `Checking ${rows.length} transactions against ${existing.length} you've already recorded around those dates`, {
					status: 'saving',
					found: rows.length,
				});

				const categoryFor = (name: string, type: 'expense' | 'income') => {
					const ofType = setup.categories.filter((c) => c.category_type === type);
					return (
						ofType.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
						ofType.find((c) => c.id === (type === 'income' ? 'cat-other-inc' : 'cat-misc')) ??
						ofType[0]
					);
				};
				const incoming = rows.map((r) => {
					const category = categoryFor(r.category, r.transaction_type);
					return { ...r, purchase_date: r.date, category_id: category.id, category: category.name };
				});
				const { fresh, duplicates } = findDuplicates(incoming, existing);

				const insert = env.DB.prepare(
					`INSERT INTO transactions (id, user_id, category_id, transaction_type, amount, currency, description, merchant,
					   payment_method, purchase_date, purchase_time, occurred_at, entry_method, original_input, ai_extraction, essentiality,
					   classification_confidence, review_status, notes, import_job_id)
					 VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, 'ai_text', ?, ?, ?, ?, ?, ?, ?)`
				);
				const statements = fresh.map((r) =>
					insert.bind(
						crypto.randomUUID(),
						setup.user_id,
						r.category_id,
						r.transaction_type,
						r.amount,
						r.description.slice(0, 200),
						r.merchant,
						r.payment_method,
						r.purchase_date,
						r.time ?? null,
						`${r.purchase_date}T${r.time ?? '12:00'}:00`,
						`Statement: ${setup.filename}`.slice(0, 1000),
						JSON.stringify({ question: r.question, options: r.options, needs: r.needs, payee: r.payee ?? null }).slice(0, 2000),
						r.transaction_type === 'income' ? 'essential' : r.essentiality,
						r.confidence ?? null,
						r.needs === 'category' ? 'pending_review' : 'confirmed',
						null,
						jobId
					)
				);
				for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));

				const needsReview = fresh.filter((r) => r.needs === 'category').length;
				const skippedRows = duplicates.map(({ item, match }) => ({
					description: item.description,
					amount: item.amount,
					date: item.purchase_date,
					matched: match.description,
				}));
				await logJob(
					env,
					jobId,
					`Done: saved ${fresh.length}, skipped ${duplicates.length} already recorded${needsReview ? `, ${needsReview} need a quick answer` : ''}.`,
					{
						status: 'done',
						added: fresh.length,
						skipped: duplicates.length,
						needs_review: needsReview,
						skipped_rows: JSON.stringify(skippedRows),
					}
				);
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Something went wrong';
			await step.do('mark failed', async () => {
				await logJob(env, jobId, `Stopped: ${message}`, { status: 'failed', error: message.slice(0, 500) });
			});
		}
	}
}
