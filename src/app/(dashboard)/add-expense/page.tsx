'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Mic, Square, Sparkles, PenLine, CornerDownLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { PageHeader } from '@/components/ui/page-header';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { toLocalDateString } from '@/lib/calculations/finance';
import { formatCurrency, cn } from '@/lib/utils';
import type { AiExtractionData, Category, EntryMethod, Essentiality, TransactionType } from '@/types/database';

const EXAMPLES = [
  'Paid 450 for lunch on Swiggy',
  'kal 1200 ka petrol bharwaya',
  'Netflix 649 credit card',
  'Got salary 85k today',
];

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Other'];
const MAX_RECORDING_MS = 30_000;

type Stage = 'capture' | 'review';

interface ExtractResponse {
  data: AiExtractionData;
  source: 'workers-ai' | 'heuristic';
  error?: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
}

export default function AddExpensePage() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>('capture');

  // Capture
  const [note, setNote] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Review form
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [essentiality, setEssentiality] = useState<Essentiality>('essential');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseTime, setPurchaseTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // AI metadata kept for transparency
  const [entryMethod, setEntryMethod] = useState<EntryMethod>('manual');
  const [originalInput, setOriginalInput] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<AiExtractionData | null>(null);
  const [extractionSource, setExtractionSource] = useState<ExtractResponse['source'] | null>(null);
  const [userCorrected, setUserCorrected] = useState(false);

  useEffect(() => {
    async function load() {
      const [cats, status] = await Promise.all([
        DataService.getCategories().catch((err) => {
          // Don't leave the sandbox defaults selectable: their ids may not exist server-side.
          toast.error(err instanceof Error ? err.message : 'Could not load categories');
          return [] as Category[];
        }),
        fetch('/api/ai/status')
          .then((r) => r.json() as Promise<{ enabled: boolean }>)
          .catch(() => ({ enabled: false })),
      ]);
      setCategories(cats);
      setAiEnabled(status.enabled);
      setPurchaseDate(toLocalDateString());
    }
    void load();
  }, []);

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.category_type === transactionType),
    [categories, transactionType]
  );
  // The chosen category must match the transaction type; otherwise use the first valid one.
  const selectedCategoryId = categoryOptions.some((c) => c.id === categoryId) ? categoryId : categoryOptions[0]?.id ?? '';

  const resetForm = useCallback(() => {
    setNote('');
    setStage('capture');
    setTransactionType('expense');
    setAmount('');
    setDescription('');
    setMerchant('');
    setCategoryId('');
    setEssentiality('essential');
    setPurchaseDate(toLocalDateString());
    setPurchaseTime('');
    setPaymentMethod('UPI');
    setNotes('');
    setEntryMethod('manual');
    setOriginalInput(null);
    setExtraction(null);
    setExtractionSource(null);
    setUserCorrected(false);
    requestAnimationFrame(() => noteRef.current?.focus());
  }, []);

  const extract = useCallback(
    async (text: string, method: EntryMethod) => {
      const input = text.trim();
      if (!input) return;
      setExtracting(true);
      try {
        const res = await fetch('/api/ai/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            input,
            today: toLocalDateString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        const json = (await res.json()) as ExtractResponse;
        if (!res.ok) throw new Error(json.error || 'Could not read that note');
        const data = json.data;

        setTransactionType(data.transaction_type);
        setAmount(data.amount ? String(data.amount) : '');
        setDescription(data.description || input);
        setMerchant(data.merchant || '');
        setEssentiality(data.essentiality);
        if (data.payment_method) setPaymentMethod(data.payment_method);
        if (data.purchase_date) setPurchaseDate(data.purchase_date);
        setPurchaseTime(data.purchase_time ?? '');
        const match = categories.find(
          (c) => c.category_type === data.transaction_type && c.name.toLowerCase() === data.category.toLowerCase()
        );
        setCategoryId(match?.id ?? '');

        setEntryMethod(method);
        setOriginalInput(input);
        setExtraction(data);
        setExtractionSource(json.source);
        setUserCorrected(false);
        setStage('review');

        if (data.needs_clarification) toast.message(data.clarification_question || 'Check the amount before saving.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not read that note');
      } finally {
        setExtracting(false);
      }
    },
    [categories]
  );

  // Voice: record with MediaRecorder, transcribe with Whisper on Workers AI, then extract.
  const startRecording = async () => {
    const mimeType = pickAudioMimeType();
    if (!navigator.mediaDevices?.getUserMedia || mimeType === undefined) {
      toast.error('Voice capture is not supported in this browser.');
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
        setRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) return;
        setTranscribing(true);
        try {
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ audio: await blobToBase64(blob) }),
          });
          const json = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(json.error || 'Could not transcribe that');
          const text = (json.text ?? '').trim();
          if (!text) {
            toast.message("Didn't catch that. Try again a little closer to the mic.");
            return;
          }
          setNote(text);
          await extract(text, 'ai_voice');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not transcribe that');
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
    } catch {
      toast.error('Microphone access was blocked.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  // Recording timer + hard stop.
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS && recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  const save = useCallback(async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter an amount above zero.');
      return;
    }
    if (!description.trim()) {
      toast.error('Add a short description.');
      return;
    }
    if (!selectedCategoryId) {
      toast.error('Choose a category.');
      return;
    }

    setSaving(true);
    try {
      await DataService.addTransaction({
        user_id: 'current-user',
        category_id: selectedCategoryId,
        transaction_type: transactionType,
        amount: value,
        currency: 'INR',
        description: description.trim(),
        merchant: merchant.trim() || null,
        payment_method: paymentMethod || null,
        purchase_date: purchaseDate,
        purchase_time: purchaseTime || null,
        occurred_at: `${purchaseDate}T${purchaseTime || '00:00'}:00`,
        entry_method: entryMethod,
        original_input: originalInput,
        ai_extraction: extraction,
        essentiality: transactionType === 'income' ? 'essential' : essentiality,
        classification_confidence: extraction?.confidence ?? null,
        classification_reason: extraction?.reasoning || null,
        user_corrected_classification: userCorrected,
        review_status: 'confirmed',
        notes: notes.trim() || null,
      });
      const summary = `${description.trim()} · ${formatCurrency(value)}`;
      setLastSaved(summary);
      toast.success('Saved', { description: summary });
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [
    amount,
    description,
    selectedCategoryId,
    transactionType,
    merchant,
    paymentMethod,
    purchaseDate,
    purchaseTime,
    entryMethod,
    originalInput,
    extraction,
    essentiality,
    userCorrected,
    notes,
    resetForm,
  ]);

  // ⌘/Ctrl + Enter saves from anywhere on the review form; Escape goes back.
  useEffect(() => {
    if (stage !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void save();
      } else if (e.key === 'Escape') {
        setStage('capture');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, save]);

  const busy = extracting || transcribing;
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="New expense"
        description="Write it the way you'd say it. We'll fill in the rest for you to check."
        actions={
          aiEnabled !== null && (
            <Badge variant="outline" className="gap-1.5 py-1">
              <span className={cn('size-1.5 rounded-full', aiEnabled ? 'bg-foreground' : 'bg-subtle')} />
              {aiEnabled ? 'Workers AI' : 'Offline parser'}
            </Badge>
          )
        }
      />

      {/* Capture */}
      <div
        className={cn(
          'relative rounded-2xl border border-border bg-card shadow-card transition-[border-color,box-shadow,opacity] animate-rise',
          'focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-foreground/[0.05]',
          stage === 'review' && 'opacity-60 focus-within:opacity-100'
        )}
      >
        <textarea
          ref={noteRef}
          autoFocus
          rows={2}
          value={note}
          disabled={recording}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter is the save shortcut on the review form; only plain Enter extracts.
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              void extract(note, 'ai_text');
            }
          }}
          placeholder={recording ? 'Listening…' : 'Paid 450 for lunch on Swiggy yesterday'}
          className="block w-full resize-none bg-transparent px-5 pt-5 pb-2 text-lg tracking-tight text-foreground placeholder:text-subtle focus:outline-none"
          aria-label="Describe the expense"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
            {recording ? (
              <span className="flex items-center gap-2 text-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                </span>
                Recording <span className="tabular">0:{String(seconds).padStart(2, '0')}</span>
              </span>
            ) : transcribing ? (
              'Transcribing…'
            ) : extracting ? (
              'Reading your note…'
            ) : (
              <span className="hidden items-center gap-1.5 sm:flex">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
                to fill in · English or Hinglish
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={recording ? 'destructive' : 'ghost'}
              size="icon"
              onClick={recording ? stopRecording : () => void startRecording()}
              disabled={busy || aiEnabled === false}
              title={aiEnabled === false ? 'Voice needs the AI service' : recording ? 'Stop' : 'Speak your expense'}
              aria-label={recording ? 'Stop recording' : 'Record voice note'}
            >
              {recording ? <Square className="fill-current" /> : <Mic />}
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => void extract(note, 'ai_text')}
              loading={busy}
              disabled={!note.trim() || recording}
              aria-label="Fill in from note"
            >
              {!busy && <ArrowUp />}
            </Button>
          </div>
        </div>
      </div>

      {stage === 'capture' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => {
                  setNote(ex);
                  void extract(ex, 'ai_text');
                }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[13px] text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setEntryMethod('manual');
                setStage('review');
              }}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <PenLine className="size-3.5" /> Enter details manually
            </button>
            {lastSaved && (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" /> {lastSaved}
                <Link href="/transactions" className="ml-1 text-foreground underline-offset-4 hover:underline">
                  View
                </Link>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Review */}
      {stage === 'review' && (
        <Card className="animate-rise">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{extraction ? 'Check and save' : 'Expense details'}</CardTitle>
              <CardDescription>
                {extraction
                  ? extractionSource === 'workers-ai'
                    ? 'Filled in by Workers AI. Change anything that looks off.'
                    : 'Filled in by the offline parser. Double-check the category.'
                  : 'Nothing is saved until you press save.'}
              </CardDescription>
            </div>
            {extraction && (
              <Badge variant="outline" className="shrink-0 gap-1" title="How sure the AI is">
                <Sparkles />
                <span className="tabular">{Math.round(extraction.confidence * 100)}%</span>
              </Badge>
            )}
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Amount" htmlFor="amount">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    autoFocus={!amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="tabular h-11 pl-7 text-lg font-medium"
                  />
                </div>
              </Field>
              <Segmented
                value={transactionType}
                onChange={(v) => {
                  setTransactionType(v);
                  setUserCorrected(true);
                }}
                options={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                ]}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Description" htmlFor="description">
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lunch" />
              </Field>
              <Field label="Merchant" htmlFor="merchant">
                <Input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Optional" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="category">
                <Select
                  id="category"
                  value={selectedCategoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setUserCorrected(true);
                  }}
                >
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paid with" htmlFor="payment">
                <Select id="payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {transactionType === 'expense' && (
              <Field
                label="Type of spending"
                hint={
                  essentiality === 'essential'
                    ? 'Needed to live: rent, groceries, bills, medicine.'
                    : essentiality === 'optimizable'
                      ? 'Needed, but could cost less: delivery, cabs, subscriptions.'
                      : 'Nice to have: entertainment, shopping, treats.'
                }
              >
                <Segmented
                  value={essentiality}
                  onChange={(v) => {
                    setEssentiality(v);
                    setUserCorrected(true);
                  }}
                  options={[
                    { value: 'essential', label: 'Essential' },
                    { value: 'optimizable', label: 'Could trim' },
                    { value: 'discretionary', label: 'Optional' },
                  ]}
                  className="flex w-full [&>button]:flex-1"
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date" htmlFor="date">
                <Input id="date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
              <Field label="Time" htmlFor="time">
                <Input id="time" type="time" value={purchaseTime} onChange={(e) => setPurchaseTime(e.target.value)} />
              </Field>
              <Field label="Note" htmlFor="notes">
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
            </div>

            {extraction?.reasoning && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Why: </span>
                {extraction.reasoning}
              </p>
            )}
          </CardContent>

          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={() => setStage('capture')}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Save {transactionType}
              <Kbd className="ml-1 hidden sm:inline-flex">⌘↵</Kbd>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
