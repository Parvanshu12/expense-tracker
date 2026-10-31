'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Mic, Square, Pencil, Undo2, FileText, RotateCcw, Paperclip, Lightbulb, ChevronDown, AlertTriangle, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Dialog } from '@/components/ui/dialog';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import { chatKey, clearChat, loadChat, saveChat } from '@/lib/chat-memory';
import { mainGoalLabels } from '@/lib/main-goals';
import { findDuplicates } from '@/lib/ai/dedupe';
import { calculateBudgetSpent, spendingWarnings, toLocalDateString, type SpendingWarning } from '@/lib/calculations/finance';
import { kindForCategory, PURCHASE_KINDS } from '@/lib/categories/kinds';
import { cn, formatCurrency } from '@/lib/utils';
import type { AiExtractionData, Budget, Category, EntryMethod, Essentiality, SavingsGoal, Transaction, TransactionType } from '@/types/database';
import type { EntryContext, EntryItem, EntryProfile, EntryResponse, StatementResponse } from '@/types/entry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedCard {
  localId: string;
  transactionId: string;
  draft: EntryItem;
  removed: boolean;
}

interface ImportSummary {
  filename: string;
  found: number;
  added: number;
  asking: number;
  skipped: { description: string; amount: number; date: string; matched: string }[];
  /** Transaction ids saved by this import, for "Undo import". */
  ids: string[];
  undone: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  /** User uploaded a file. */
  attachment?: string;
  cards?: SavedCard[];
  /** Saved cards beyond the first few, for big imports. */
  hiddenCards?: number;
  feedback?: string | null;
  /** Exact warnings (budgets, overspending, goals at risk, big purchases) or a reassuring line. */
  notes?: SpendingWarning[];
  question?: string;
  importSummary?: ImportSummary;
  offline?: boolean;
}

type PendingDraft = EntryItem & { ref: string; from: 'chat' | 'statement' };

const EXAMPLES = [
  '450 lunch on Swiggy, 1200 petrol and 180 for sabzi',
  'kal 2 coffee 360 aur auto 90',
  'Got salary 85k today',
  'Paid 2000 on Amazon',
];

const SKIP_PATTERN = /^(skip|no|nope|nahi|nahin|cancel|leave it|chhodo|chodo|rehne do|keep it|theek hai)\b/i;
const MAX_RECORDING_MS = 30_000;
const MAX_STORED_MESSAGES = 80;
const CONTEXT_MESSAGES = 10;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const CARDS_SHOWN = 6;

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`;

/** A reply that is only an amount ("2999", "₹3.5k", "500 rs"). */
function parseBareAmount(text: string): number | null {
  const m = text.trim().match(/^(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:₹|rs\.?|rupees|rupay|inr|\/-)?\.?$/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today';
  const [y, m, d] = today.split('-').map(Number);
  if (date === new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00`));
}

function toExtraction(item: EntryItem): AiExtractionData {
  return {
    transaction_type: item.transaction_type,
    amount: item.amount,
    currency: 'INR',
    description: item.description,
    merchant: item.merchant,
    category: item.category,
    purchase_date: item.purchase_date,
    purchase_time: null,
    payment_method: item.payment_method,
    essentiality: item.essentiality,
    confidence: item.confidence,
  };
}

function toNewTransaction(draft: EntryItem, originalInput: string, method: EntryMethod): Omit<Transaction, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: 'current-user',
    category_id: draft.category_id,
    transaction_type: draft.transaction_type,
    amount: draft.amount!,
    currency: 'INR',
    description: draft.description,
    merchant: draft.merchant,
    payment_method: draft.payment_method,
    purchase_date: draft.purchase_date,
    purchase_time: null,
    occurred_at: `${draft.purchase_date}T12:00:00`,
    entry_method: method,
    original_input: originalInput.slice(0, 1000),
    ai_extraction: toExtraction(draft),
    essentiality: draft.essentiality,
    classification_confidence: draft.confidence,
    classification_reason: null,
    user_corrected_classification: false,
    review_status: 'confirmed',
    notes: null,
  };
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
}

function questionFor(p: PendingDraft): string {
  return p.question || (p.needs === 'category' ? `What was "${p.description}" for?` : `How much was "${p.description}"?`);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AddExpensePage() {
  const { user } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingDraft[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<false | 'thinking' | 'listening' | 'transcribing' | 'reading'>(false);
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState<SavedCard | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const memoryKey = chatKey('entry', user?.id);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    async function load() {
      await DataService.seedDemoDataIfEmpty();
      const [cats, txs, bgts, gls] = await Promise.all([
        DataService.getCategories().catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Could not load categories');
          return [] as Category[];
        }),
        DataService.getTransactions().catch(() => [] as Transaction[]),
        DataService.getBudgets().catch(() => [] as Budget[]),
        DataService.getGoals().catch(() => [] as SavingsGoal[]),
      ]);
      setCategories(cats);
      setTransactions(txs);
      setBudgets(bgts);
      setGoals(gls);
      setToday(toLocalDateString());
      // Pick up where the last conversation left off.
      const saved = loadChat<{ messages: Message[]; pending: PendingDraft[] }>(memoryKey);
      if (saved) {
        setMessages(saved.messages ?? []);
        setPending(saved.pending ?? []);
      }
      setRestored(true);
    }
    void load();
  }, [memoryKey]);

  useEffect(() => {
    if (restored) saveChat(memoryKey, { messages: messages.slice(-MAX_STORED_MESSAGES), pending });
  }, [messages, pending, restored, memoryKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const categoryName = (id: string | null) =>
    id === null ? 'Overall' : categories.find((c) => c.id === id)?.name ?? 'Category';

  const profile: EntryProfile = {
    userType: user?.user_type ?? null,
    monthlyIncome: user?.monthly_income ?? null,
    goals: mainGoalLabels(user?.main_goals),
  };

  /** This month's picture, so the AI's feedback fits (it never quotes these numbers). */
  const context = useMemo((): EntryContext => {
    if (!today) return {};
    const month = today.slice(0, 7);
    const byCategory: Record<string, number> = {};
    for (const t of transactions) {
      if (t.transaction_type !== 'expense' || !t.purchase_date.startsWith(month)) continue;
      const name = t.category?.name ?? categoryName(t.category_id);
      byCategory[name] = (byCategory[name] ?? 0) + Number(t.amount);
    }
    const top = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return {
      monthSpentByCategory: Object.fromEntries(top),
      budgets: budgets.map((b) => ({
        category: categoryName(b.category_id),
        limit: Number(b.amount),
        spent: calculateBudgetSpent(transactions, b, today),
      })),
    };
    // categoryName only depends on categories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, budgets, categories, today]);

  /** Exact warnings for what was just saved (computed here, never by the AI). */
  const warningsFor = (saved: Transaction[], allTx: Transaction[]): SpendingWarning[] =>
    spendingWarnings({
      justSaved: saved,
      transactions: allTx,
      budgets,
      goals,
      monthlyIncome: user?.monthly_income,
      today: toLocalDateString(),
      categoryName,
    });

  const say = (message: Omit<Message, 'id' | 'role'>) =>
    setMessages((prev) => [...prev, { id: nextId('a'), role: 'assistant', ...message }]);

  /** Saves drafts (one request for many); returns the cards and new transactions. */
  const saveDrafts = async (
    drafts: EntryItem[],
    originalInput: string,
    method: EntryMethod
  ): Promise<{ cards: SavedCard[]; saved: Transaction[]; allTx: Transaction[] }> => {
    if (drafts.length === 0) return { cards: [], saved: [], allTx: transactions };
    try {
      const saved = await DataService.addTransactions(drafts.map((d) => toNewTransaction(d, originalInput, method)));
      const allTx = [...saved, ...transactions];
      setTransactions(allTx);
      return {
        cards: saved.map((tx, i) => ({ localId: nextId('c'), transactionId: tx.id, draft: drafts[i], removed: false })),
        saved,
        allTx,
      };
    } catch (err) {
      toast.error("Couldn't save that", { description: err instanceof Error ? err.message : undefined });
      return { cards: [], saved: [], allTx: transactions };
    }
  };

  const summary = (cards: SavedCard[]) => {
    if (cards.length === 0) return undefined;
    if (cards.length === 1) return 'Saved.';
    const total = cards.reduce((sum, c) => sum + (c.draft.amount ?? 0), 0);
    return `Saved ${cards.length} entries · ${formatCurrency(total)}`;
  };

  const resolvePending = async (first: PendingDraft, resolved: EntryItem, rest: PendingDraft[], text: string, method: EntryMethod) => {
    const { cards, saved, allTx } = await saveDrafts([{ ...resolved, needs: null, question: null, options: [] }], text, method);
    setPending(rest);
    say({
      cards,
      text: summary(cards),
      notes: warningsFor(saved, allTx),
      question: rest.length ? questionFor(rest[0]) : undefined,
    });
    if (!rest.length && cards.length && first.from === 'statement') say({ text: "That's everything from your statement. Anything else?" });
  };

  const send = async (raw: string, method: EntryMethod = 'ai_text') => {
    const text = raw.trim();
    if (!text || busy) return;
    const now = toLocalDateString();
    setToday(now);
    setMessages((prev) => [...prev, { id: nextId('u'), role: 'user', text }]);
    setInput('');

    // Quick answers to an open question need no AI round trip.
    if (pending.length) {
      const [first, ...rest] = pending;
      if (first.needs === 'amount') {
        const amount = parseBareAmount(text);
        if (amount !== null) return resolvePending(first, { ...first, amount }, rest, text, method);
      }
      if (first.needs === 'category') {
        const match = categories.find(
          (c) => c.category_type === first.transaction_type && c.name.toLowerCase() === text.toLowerCase()
        );
        if (match) return resolvePending(first, { ...first, category_id: match.id, category: match.name }, rest, text, method);
      }
      if (SKIP_PATTERN.test(text)) {
        if (first.amount !== null) {
          // We know the money moved; keep it under the best guess rather than lose it.
          return resolvePending(first, first, rest, text, method);
        }
        setPending(rest);
        say({ text: `Okay, skipped "${first.description}".`, question: rest.length ? questionFor(rest[0]) : undefined });
        return;
      }
    }

    setBusy('thinking');
    try {
      const history = messages
        .slice(-CONTEXT_MESSAGES)
        .map((m) => ({ role: m.role, content: m.text || m.question || m.feedback || '' }))
        .filter((m) => m.content);
      const res = await fetch('/api/ai/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          pending: pending.slice(0, 10).map(({ ref, description, category, transaction_type, amount, needs }) => ({
            ref,
            description,
            category,
            transaction_type,
            amount,
            needs: needs ?? 'amount',
          })),
          history,
          today: now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          profile,
          context,
        }),
      });
      const data = (await res.json()) as EntryResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      let queue = [...pending];
      const toSave: EntryItem[] = [];
      for (const item of data.items) {
        const waiting = item.ref ? queue.find((p) => p.ref === item.ref) : undefined;
        if (waiting) {
          const merged: EntryItem =
            waiting.needs === 'category'
              ? { ...waiting, category_id: item.category_id, category: item.category, essentiality: item.essentiality }
              : { ...waiting, amount: item.amount, payment_method: item.payment_method ?? waiting.payment_method };
          const stillNeeds = merged.amount === null ? 'amount' : waiting.needs === 'category' && item.needs === 'category' ? 'category' : null;
          if (!stillNeeds) {
            queue = queue.filter((p) => p.ref !== waiting.ref);
            toSave.push(merged);
          }
        } else if (item.needs === null && item.amount !== null) {
          toSave.push(item);
        } else {
          queue.push({ ...item, ref: nextId('p'), from: 'chat' });
        }
      }

      const { cards, saved, allTx } = await saveDrafts(toSave, text, method);
      setPending(queue);
      const nothing = cards.length === 0 && data.items.length === 0;
      say({
        cards,
        text: nothing ? data.reply : summary(cards),
        feedback: cards.length ? data.feedback : null,
        notes: warningsFor(saved, allTx),
        question: queue.length ? questionFor(queue[0]) : undefined,
        offline: data.source === 'heuristic' && cards.length > 0,
      });
    } catch (err) {
      say({ text: "Sorry, I couldn't process that just now. Please try again in a moment." });
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // Bank statement: read with Workers AI, skip what's already recorded, save the rest, ask about unclear ones.
  const importStatement = async (file: File) => {
    if (busy) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('That file is too large. Please upload a statement under 6 MB.');
      return;
    }
    setMessages((prev) => [...prev, { id: nextId('u'), role: 'user', attachment: file.name }]);
    setBusy('reading');
    try {
      const res = await fetch('/api/ai/statement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: await fileToBase64(file), filename: file.name, today: toLocalDateString(), profile }),
      });
      const data = (await res.json()) as StatementResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not read that statement');
      if (data.items.length === 0) {
        say({ text: "I couldn't find any transactions in that file. Is it a bank or card statement? PDF, Excel and CSV exports work best." });
        return;
      }

      // Already recorded (in chat, by hand or a previous import)? Skip it.
      const known = [
        ...transactions,
        ...pending.filter((p) => p.amount !== null).map((p) => ({ ...p, id: p.ref })),
      ] as (Transaction | (PendingDraft & { id: string }))[];
      const { fresh, duplicates } = findDuplicates(data.items, known);
      const ready = fresh.filter((i) => i.needs === null);
      const unclear: PendingDraft[] = fresh
        .filter((i) => i.needs !== null)
        .map((i) => ({ ...i, ref: nextId('p'), from: 'statement' as const }));

      const { cards, saved, allTx } = await saveDrafts(ready, `Statement: ${file.name}`, 'manual');
      const queue = [...pending, ...unclear];
      setPending(queue);

      const importSummary: ImportSummary = {
        filename: file.name,
        found: data.items.length,
        added: cards.length,
        asking: unclear.length,
        skipped: duplicates.map(({ item, match }) => ({
          description: item.description,
          amount: item.amount ?? 0,
          date: item.purchase_date,
          matched: 'description' in match ? match.description : '',
        })),
        ids: cards.map((c) => c.transactionId),
        undone: false,
      };
      say({
        importSummary,
        cards: cards.slice(0, CARDS_SHOWN),
        hiddenCards: Math.max(0, cards.length - CARDS_SHOWN),
        notes: warningsFor(saved, allTx),
        question: unclear.length ? questionFor(queue[0]) : undefined,
      });
      if (data.truncated) toast.message('That statement was very long, so only the first part was read.');
    } catch (err) {
      say({ text: err instanceof Error ? err.message : "Sorry, I couldn't read that file." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const undoImport = async (messageId: string, summaryData: ImportSummary) => {
    try {
      for (const id of summaryData.ids) await DataService.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => !summaryData.ids.includes(t.id)));
      setPending((prev) => prev.filter((p) => p.from !== 'statement'));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.importSummary
            ? {
                ...m,
                importSummary: { ...m.importSummary, undone: true },
                question: undefined,
                cards: m.cards?.map((c) => ({ ...c, removed: true })),
              }
            : m
        )
      );
      toast.success(`Removed ${summaryData.ids.length} imported entries`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not undo the import');
    }
  };

  // Voice: record, transcribe with Whisper on Workers AI, then send as a chat message.
  const startRecording = async () => {
    const mimeType = pickAudioMimeType();
    if (!navigator.mediaDevices?.getUserMedia || mimeType === undefined) {
      toast.error('Voice input is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) {
          setBusy(false);
          return;
        }
        setBusy('transcribing');
        try {
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ audio: await fileToBase64(blob) }),
          });
          const json = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(json.error || 'Could not understand the recording');
          setBusy(false);
          const heard = (json.text ?? '').trim();
          if (heard) await send(heard, 'ai_voice');
          else toast.message("Didn't catch that. Try again a little closer to the mic.");
        } catch (err) {
          setBusy(false);
          toast.error(err instanceof Error ? err.message : 'Could not understand the recording');
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setBusy('listening');
      window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_RECORDING_MS);
    } catch {
      toast.error('Microphone access was blocked.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const updateCard = (localId: string, patch: Partial<SavedCard>) =>
    setMessages((prev) =>
      prev.map((m) => (m.cards ? { ...m, cards: m.cards.map((c) => (c.localId === localId ? { ...c, ...patch } : c)) } : m))
    );

  const removeCard = async (card: SavedCard) => {
    try {
      await DataService.deleteTransaction(card.transactionId);
      setTransactions((prev) => prev.filter((t) => t.id !== card.transactionId));
      updateCard(card.localId, { removed: true });
      toast.success(`Removed "${card.draft.description}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove it');
    }
  };

  const startNewChat = () => {
    clearChat(memoryKey);
    setMessages([]);
    setPending([]);
    inputRef.current?.focus();
  };

  const firstPending = pending[0];
  const greetingName = user?.display_name?.split(' ')[0];
  const placeholder =
    busy === 'listening'
      ? 'Listening… tap stop when you are done'
      : firstPending?.needs === 'amount'
        ? 'Type the amount, e.g. 2999, or say "skip"'
        : firstPending?.needs === 'category'
          ? 'Tap an option above, or tell me what it was'
          : 'What did you spend or earn?';
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-3rem)] max-w-2xl flex-col md:h-[calc(100dvh-3.5rem-4rem)]">
      {/* Title */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Add spending</h1>
          <p className="text-[13px] text-muted-foreground">Just tell me, like you&apos;d tell a friend.</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={startNewChat} disabled={Boolean(busy)} title="Start a new conversation">
              <RotateCcw /> <span className="hidden sm:inline">New chat</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setManualOpen(true)}>
            <FileText /> <span className="hidden sm:inline">Use a form</span>
          </Button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 pb-4" aria-live="polite">
        <Bubble role="assistant">
          <p>
            {greetingName ? `Hi ${greetingName}! ` : 'Hi! '}Tell me what you spent or earned. You can list several things in one
            message, in English or Hinglish. You can also attach a bank statement and I&apos;ll add what&apos;s missing.
          </p>
        </Bubble>
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pl-1 animate-fade-in">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => void send(ex)}
                className="min-h-9 rounded-full border border-border bg-card px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-primary/40 px-3 py-1.5 text-[13px] text-primary transition-colors hover:bg-primary/5"
            >
              <Paperclip className="size-3.5" /> Upload a bank statement
            </button>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <Bubble key={m.id} role="user">
              {m.attachment ? (
                <span className="inline-flex items-center gap-2">
                  <Paperclip className="size-4" /> {m.attachment}
                </span>
              ) : (
                m.text
              )}
            </Bubble>
          ) : (
            <div key={m.id} className="space-y-2 animate-rise">
              {m.importSummary && (
                <ImportSummaryCard summary={m.importSummary} onUndo={() => void undoImport(m.id, m.importSummary!)} />
              )}
              {m.cards && m.cards.length > 0 && (
                <div className="max-w-[92%] overflow-hidden rounded-2xl rounded-bl-md border border-border bg-card shadow-card">
                  <ul className="divide-y divide-border">
                    {m.cards.map((card) => (
                      <ExpenseRow
                        key={card.localId}
                        card={card}
                        today={today}
                        onEdit={() => setEditing(card)}
                        onRemove={() => void removeCard(card)}
                      />
                    ))}
                  </ul>
                  {Boolean(m.hiddenCards) && (
                    <Link
                      href="/transactions"
                      className="block border-t border-border px-4 py-2 text-xs text-primary hover:underline"
                    >
                      + {m.hiddenCards} more · see them in My spending
                    </Link>
                  )}
                  {(m.text || m.feedback || m.notes?.length) && (
                    <div className="space-y-1.5 border-t border-border bg-muted/40 px-4 py-2.5 text-[13px]">
                      {m.text && (
                        <div className="flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{m.text}</span>
                          {m.offline && <span title="The AI service was unavailable">Offline mode · check categories</span>}
                        </div>
                      )}
                      {m.feedback && (
                        <p className="flex gap-2 text-foreground">
                          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
                          <span>{m.feedback}</span>
                        </p>
                      )}
                      {m.notes?.map((n, i) => (
                        <p
                          key={i}
                          className={cn(
                            'flex gap-2 font-medium',
                            n.tone === 'success' ? 'text-success' : n.tone === 'warning' ? 'text-warning' : 'text-destructive'
                          )}
                        >
                          {n.tone === 'success' ? (
                            <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          )}
                          <span>{n.text}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {m.text && !(m.cards && m.cards.length > 0) && <Bubble role="assistant">{m.text}</Bubble>}
              {m.question && (
                <Bubble role="assistant">
                  <p>{m.question}</p>
                </Bubble>
              )}
              {/* Tap-to-answer options for the open category question */}
              {m.id === lastAssistantId && firstPending?.needs === 'category' && !busy && (
                <div className="flex flex-wrap gap-2 pl-1 animate-fade-in">
                  {firstPending.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => void send(opt)}
                      className="min-h-9 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {busy && busy !== 'listening' && (
          <Bubble role="assistant">
            <span className="flex items-center gap-2 text-muted-foreground">
              <TypingDots />
              {busy === 'transcribing'
                ? 'Listening to your note…'
                : busy === 'reading'
                  ? 'Reading your statement. This can take up to a minute…'
                  : 'Sorting that out…'}
            </span>
          </Bubble>
        )}
      </div>

      {/* Quick reply while a question is open */}
      {firstPending && !busy && (
        <div className="flex flex-wrap gap-2 pb-2 animate-fade-in">
          <button
            type="button"
            onClick={() => void send('skip')}
            className="min-h-9 rounded-full border border-border bg-card px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            {firstPending.amount !== null ? `Keep as ${firstPending.category}` : `Skip "${firstPending.description}"`}
          </button>
          {pending.length > 1 && (
            <span className="self-center text-xs text-muted-foreground">{pending.length - 1} more after this</span>
          )}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className={cn(
          'flex items-end gap-1.5 rounded-2xl border border-input bg-card p-2 shadow-card transition-[border-color,box-shadow]',
          'focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10'
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.ods,.txt,application/pdf,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importStatement(file);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(busy)}
          aria-label="Upload a bank statement"
          title="Upload a bank statement (PDF, Excel or CSV)"
        >
          <Paperclip />
        </Button>
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          value={input}
          disabled={busy === 'listening' || busy === 'transcribing'}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={placeholder}
          maxLength={1000}
          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-snug placeholder:text-subtle focus:outline-none"
          aria-label="Message"
        />
        <Button
          type="button"
          variant={busy === 'listening' ? 'destructive' : 'ghost'}
          size="icon"
          onClick={busy === 'listening' ? stopRecording : () => void startRecording()}
          disabled={busy === 'thinking' || busy === 'transcribing' || busy === 'reading'}
          aria-label={busy === 'listening' ? 'Stop recording' : 'Speak instead'}
          title={busy === 'listening' ? 'Stop' : 'Speak instead'}
        >
          {busy === 'listening' ? <Square className="fill-current" /> : <Mic />}
        </Button>
        <Button type="submit" size="icon" disabled={!input.trim() || Boolean(busy)} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        Saved straight to{' '}
        <Link href="/transactions" className="underline underline-offset-2 hover:text-foreground">
          My spending
        </Link>
        . Use Undo on any line if something&apos;s wrong.
      </p>

      <ExpenseDialog
        open={Boolean(editing)}
        title="Edit entry"
        categories={categories}
        initial={editing?.draft}
        onClose={() => setEditing(null)}
        onSubmit={async (draft) => {
          if (!editing) return;
          await DataService.updateTransaction(editing.transactionId, {
            amount: draft.amount!,
            description: draft.description,
            category_id: draft.category_id,
            purchase_date: draft.purchase_date,
            essentiality: draft.essentiality,
            user_corrected_classification: true,
          });
          updateCard(editing.localId, { draft });
          setEditing(null);
          toast.success('Updated');
        }}
      />

      <ExpenseDialog
        open={manualOpen}
        title="Add with a form"
        categories={categories}
        allowTypeChange
        onClose={() => setManualOpen(false)}
        onSubmit={async (draft) => {
          const { cards } = await saveDrafts([draft], draft.description, 'manual');
          setManualOpen(false);
          if (cards.length) say({ cards, text: 'Added from the form.' });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return (
    <div className={cn('flex animate-rise', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
          role === 'user'
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border border-border bg-card text-foreground shadow-card'
        )}
      >
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

function ImportSummaryCard({ summary, onUndo }: { summary: ImportSummary; onUndo: () => void }) {
  const [showSkipped, setShowSkipped] = useState(false);
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {summary.undone ? 'Import undone' : `I read ${summary.found} transactions from your statement`}
          </p>
          <p className="truncate text-xs text-muted-foreground">{summary.filename}</p>
        </div>
        {!summary.undone && summary.ids.length > 0 && (
          <Button variant="outline" size="sm" onClick={onUndo}>
            <Undo2 /> Undo import
          </Button>
        )}
      </div>
      {!summary.undone && (
        <ul className="mt-3 space-y-1 text-[13px]">
          <li className="text-success">✓ Added {summary.added}</li>
          {summary.skipped.length > 0 && (
            <li className="text-muted-foreground">
              ↺ Skipped {summary.skipped.length} you had already recorded
              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                {showSkipped ? 'hide' : 'show'}
                <ChevronDown className={cn('size-3 transition-transform', showSkipped && 'rotate-180')} />
              </button>
            </li>
          )}
          {summary.asking > 0 && <li className="text-warning">? {summary.asking} need a quick answer from you</li>}
        </ul>
      )}
      {showSkipped && !summary.undone && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {summary.skipped.map((s, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">
                {s.description} · {s.date}
                {s.matched && <> · matches “{s.matched}”</>}
              </span>
              <span className="tabular shrink-0">{formatCurrency(s.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpenseRow({
  card,
  today,
  onEdit,
  onRemove,
}: {
  card: SavedCard;
  today: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { draft } = card;
  const kind = kindForCategory({ id: draft.category_id, name: draft.category, category_type: draft.transaction_type });
  const income = draft.transaction_type === 'income';
  const meta = [draft.category, today ? relativeDay(draft.purchase_date, today) : draft.purchase_date, draft.payment_method]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={cn('group flex items-center gap-3 px-4 py-3', card.removed && 'opacity-50')}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: PURCHASE_KINDS[kind].color }} title={PURCHASE_KINDS[kind].label} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm font-medium', card.removed && 'line-through')}>{draft.description}</div>
        <div className="truncate text-xs text-muted-foreground">{card.removed ? 'Removed' : meta}</div>
      </div>
      <div className={cn('tabular shrink-0 text-sm font-medium', income && 'text-success', card.removed && 'line-through')}>
        {income ? '+' : ''}
        {formatCurrency(draft.amount ?? 0)}
      </div>
      {!card.removed && (
        <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${draft.description}`} title="Edit">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Undo ${draft.description}`} title="Undo">
            <Undo2 />
          </Button>
        </div>
      )}
    </li>
  );
}

const ESSENTIALITY_HINT: Record<Essentiality, string> = {
  essential: 'Needed to live: rent, groceries, bills, medicine.',
  optimizable: 'Needed, but could cost less: delivery, cabs, subscriptions.',
  discretionary: 'Nice to have: entertainment, shopping, treats.',
};

/** Small form used for "Use a form" and for editing a saved entry. */
function ExpenseDialog({
  open,
  title,
  categories,
  initial,
  allowTypeChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  categories: Category[];
  initial?: EntryItem;
  allowTypeChange?: boolean;
  onClose: () => void;
  onSubmit: (draft: EntryItem) => Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [essentiality, setEssentiality] = useState<Essentiality>('essential');
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset fields each time the dialog opens (keyed by what it opened for).
  const key = open ? (initial ? `${initial.description}-${initial.amount}-${initial.category_id}` : 'new') : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) {
      setType(initial?.transaction_type ?? 'expense');
      setAmount(initial?.amount ? String(initial.amount) : '');
      setDescription(initial?.description ?? '');
      setCategoryId(initial?.category_id ?? '');
      setDate(initial?.purchase_date ?? toLocalDateString());
      setEssentiality(initial?.essentiality ?? 'essential');
    }
  }

  const options = useMemo(() => categories.filter((c) => c.category_type === type), [categories, type]);
  const selectedId = options.some((c) => c.id === categoryId) ? categoryId : options[0]?.id ?? '';

  const submit = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error('Enter an amount above zero.');
    if (!description.trim()) return toast.error('Say what it was for.');
    if (!selectedId) return toast.error('Choose a category.');
    setSaving(true);
    try {
      await onSubmit({
        ref: null,
        transaction_type: type,
        amount: value,
        description: description.trim(),
        merchant: initial?.merchant ?? null,
        category_id: selectedId,
        category: options.find((c) => c.id === selectedId)?.name ?? '',
        purchase_date: date,
        payment_method: initial?.payment_method ?? null,
        essentiality: type === 'income' ? 'essential' : essentiality,
        confidence: 1,
        needs: null,
        question: null,
        options: [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {allowTypeChange && (
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Money spent' },
              { value: 'income', label: 'Money received' },
            ]}
            className="flex w-full [&>button]:flex-1"
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" htmlFor="dlg-amount">
            <Input
              id="dlg-amount"
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Date" htmlFor="dlg-date">
            <Input id="dlg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="What was it for?" htmlFor="dlg-desc">
          <Input id="dlg-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lunch" />
        </Field>
        <Field label="Category" htmlFor="dlg-cat">
          <Select id="dlg-cat" value={selectedId} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'expense' && (
          <Field label="Type of spending" hint={ESSENTIALITY_HINT[essentiality]}>
            <Segmented
              value={essentiality}
              onChange={setEssentiality}
              options={[
                { value: 'essential', label: 'Essential' },
                { value: 'optimizable', label: 'Could trim' },
                { value: 'discretionary', label: 'Optional' },
              ]}
              className="flex w-full [&>button]:flex-1"
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
