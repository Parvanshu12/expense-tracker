/**
 * SpendWise AI worker — Workers AI endpoints for the SpendWise web app.
 *
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
