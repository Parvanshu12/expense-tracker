/**
 * SpendWise AI worker — Workers AI endpoints for the SpendWise web app.
 *
 *   POST /v1/entry       chat message -> several transactions + questions for missing amounts
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
			reply: { type: 'string', description: 'Short message to the user' },
			feedback: {
				type: ['string', 'null'],
				description: 'One short, warm sentence about what was recorded, without numbers; null if nothing was recorded',
			},
		},
		required: ['items', 'reply', 'feedback'],
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
	const bytes = Uint8Array.from(atob(req.file), (c) => c.charCodeAt(0));
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
	if (env.ALLOW_MODEL_OVERRIDE === 'true' && request.headers.get('x-debug-text')) return new Response(text);
	const chunks = splitIntoChunks(text).slice(0, MAX_STATEMENT_CHUNKS);
	if (!chunks.length) throw new HttpError(422, "That file doesn't seem to contain any text.");

	const system = statementPrompt(body);
	const schema = statementSchema(body.categories);
	const results: { items: (EntryItem & { date: string })[] }[] = [];
	// A few chunks at a time keeps latency down without tripping model rate limits.
	for (let i = 0; i < chunks.length; i += 4) {
		const batch = await Promise.all(
			chunks.slice(i, i + 4).map(async (chunk) => {
				try {
					const out = await env.AI.run(model as typeof env.ENTRY_MODEL, {
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: chunk },
						],
						response_format: { type: 'json_schema', json_schema: schema },
						temperature: 0,
						max_tokens: 6000,
					});
					const data = structuredOutput(out) as { items?: (EntryItem & { date: string })[] } | null;
					// Keep only rows whose amount really appears in this part of the statement.
					const mentions = moneyMentions(chunk).map((m) => m.value);
					const items = (data?.items ?? []).filter(
						(it) =>
							typeof it.amount === 'number' &&
							it.amount > 0 &&
							/^\d{4}-\d{2}-\d{2}$/.test(it.date) &&
							mentions.some((v) => Math.abs(v - (it.amount as number)) < 0.01)
					);
					return { items };
				} catch (err) {
					console.error('Statement chunk failed', err);
					return { items: [] };
				}
			})
		);
		results.push(...batch);
	}

	// Belt and braces for the "skip" rule: these would double count spending.
	const internal = /credit ?card (bill|payment)|\bcc (payment|autopay|bill)|card (bill|autopay)|own a\/?c|self transfer|transfer to own/i;
	const items = results
		.flatMap((r) => r.items)
		.filter((it) => !internal.test(`${it.description} ${it.merchant ?? ''}`))
		.map((it) => ({ ...it, options: Array.isArray(it.options) ? it.options : [], needs: it.needs === 'category' ? 'category' : null }));
	return json({
		data: { items },
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
