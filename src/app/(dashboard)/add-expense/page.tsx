'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Mic,
  MicOff,
  PenTool,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Tag,
  DollarSign,
  HelpCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Category, Essentiality, TransactionType, EntryMethod } from '@/types/database';
import { toast } from 'sonner';

export default function AddExpensePage() {
  const router = useRouter();
  const [entryMode, setEntryMode] = useState<'ai_text' | 'voice' | 'manual'>('ai_text');
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);

  // AI & Voice inputs
  const [naturalText, setNaturalText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // Review & Confirmation Modal / Stage
  const [isReviewing, setIsReviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable Form fields (used in Manual mode and in Review stage)
  const [amount, setAmount] = useState<string>('');
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState<string>('cat-food');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [purchaseTime, setPurchaseTime] = useState<string>('12:00');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [essentiality, setEssentiality] = useState<Essentiality>('essential');
  const [notes, setNotes] = useState('');

  // AI metadata preserved for transparency
  const [originalInput, setOriginalInput] = useState<string | null>(null);
  const [aiExtractionMeta, setAiExtractionMeta] = useState<any>(null);
  const [userCorrected, setUserCorrected] = useState(false);

  useEffect(() => {
    async function loadCats() {
      const cats = await DataService.getCategories();
      setCategories(cats);
    }
    loadCats();
    setPurchaseDate(new Date().toISOString().split('T')[0]);

    // Check Speech Recognition support
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setSpeechSupported(true);
    }
  }, []);

  // Voice recognition handler
  const toggleVoiceListening = () => {
    if (!speechSupported) {
      toast.error('Voice recognition is not supported in this browser. Please use text entry.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        toast.info('Listening... speak your expense now (e.g. "Paid 450 for coffee at Starbucks")');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setNaturalText(transcript);
        setIsListening(false);
        toast.success('Voice captured! Click "Extract with AI" to review.');
      };

      recognition.onerror = () => {
        setIsListening(false);
        toast.error('Voice recognition error. Please try again or type directly.');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      toast.error('Could not initialize microphone service.');
    }
  };

  // Run AI Extraction on Natural Language or Voice Transcript
  const handleExtractWithAI = async () => {
    if (!naturalText.trim()) {
      toast.error('Please enter an expense description first.');
      return;
    }

    setAiAnalyzing(true);
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: naturalText }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');

      const data = json.data;
      setOriginalInput(naturalText);
      setAiExtractionMeta(data);

      // Populate review fields
      if (data.amount !== null && data.amount !== undefined) {
        setAmount(data.amount.toString());
      }
      setTransactionType(data.transaction_type || 'expense');
      setDescription(data.description || naturalText);
      setMerchant(data.merchant || '');
      setEssentiality(data.essentiality || 'essential');
      if (data.payment_method) setPaymentMethod(data.payment_method);
      if (data.purchase_date) setPurchaseDate(data.purchase_date);

      // Match category
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase() === (data.category || '').toLowerCase()
      );
      if (matchedCat) {
        setCategoryId(matchedCat.id);
      }

      setIsReviewing(true);

      if (data.needs_clarification) {
        toast.warning(data.clarification_question || 'Please verify amount or details.');
      } else {
        toast.success('AI successfully extracted details! Please review and confirm.');
      }
    } catch (err: any) {
      toast.error(err.message || 'AI extraction failed. You can enter details manually.');
      // Open manual form with description prefilled
      setDescription(naturalText);
      setOriginalInput(naturalText);
      setIsReviewing(true);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Confirm and Save to Database
  const handleConfirmAndSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive transaction amount.');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required.');
      return;
    }

    setSaving(true);
    try {
      const entryMethod: EntryMethod =
        entryMode === 'voice' ? 'ai_voice' : entryMode === 'ai_text' ? 'ai_text' : 'manual';

      await DataService.addTransaction({
        user_id: 'current-user',
        category_id: categoryId,
        transaction_type: transactionType,
        amount: numAmount,
        currency: 'INR',
        description: description.trim(),
        merchant: merchant.trim() || null,
        payment_method: paymentMethod || null,
        purchase_date: purchaseDate,
        purchase_time: purchaseTime || null,
        occurred_at: `${purchaseDate}T${purchaseTime || '00:00'}:00Z`,
        entry_method: entryMethod,
        original_input: originalInput,
        ai_extraction: aiExtractionMeta,
        essentiality: essentiality,
        classification_confidence: aiExtractionMeta?.confidence || 1.0,
        classification_reason: aiExtractionMeta?.reasoning || 'User confirmed entry',
        user_corrected_classification: userCorrected,
        review_status: 'confirmed',
        notes: notes.trim() || null,
      });

      toast.success('Transaction saved to your ledger!');
      router.push('/transactions');
    } catch (err: any) {
      toast.error('Failed to save transaction: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Mode Switcher Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setEntryMode('ai_text');
            setIsReviewing(false);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            entryMode === 'ai_text'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Natural Language AI</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setEntryMode('voice');
            setIsReviewing(false);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            entryMode === 'voice'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Mic className="h-3.5 w-3.5" />
          <span>Voice Entry</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setEntryMode('manual');
            setIsReviewing(true); // Manual opens form immediately
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            entryMode === 'manual'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <PenTool className="h-3.5 w-3.5" />
          <span>Manual Entry</span>
        </button>
      </div>

      {/* Mode A: Natural Language Text Entry */}
      {entryMode === 'ai_text' && !isReviewing && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Write Your Expense Naturally
            </CardTitle>
            <CardDescription className="text-xs">
              SpendWise AI extracts the amount, vendor, category, date, and essentiality classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              rows={4}
              value={naturalText}
              onChange={(e) => setNaturalText(e.target.value)}
              placeholder="e.g. 'Spent ₹250 on lunch at Subway today' or 'Paid 1400 rupees for electricity bill yesterday via UPI'"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700 dark:text-slate-300">Quick examples:</span>
              <button
                type="button"
                onClick={() => setNaturalText('Spent ₹850 on groceries at Nature Basket')}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
              >
                &ldquo;Spent ₹850 on groceries at Nature Basket&rdquo;
              </button>
              <button
                type="button"
                onClick={() => setNaturalText('Paid 350 for Uber cab at 8 PM')}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
              >
                &ldquo;Paid 350 for Uber cab at 8 PM&rdquo;
              </button>
              <button
                type="button"
                onClick={() => setNaturalText('Received 85000 salary from employer')}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
              >
                &ldquo;Received 85000 salary from employer&rdquo;
              </button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              You review and confirm before anything is saved.
            </p>
            <Button
              variant="ai"
              onClick={handleExtractWithAI}
              disabled={aiAnalyzing || !naturalText.trim()}
              className="gap-2"
            >
              {aiAnalyzing ? 'AI Parsing...' : 'Extract with AI'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Mode B: Voice Entry */}
      {entryMode === 'voice' && !isReviewing && (
        <Card className="shadow-md text-center py-8">
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={toggleVoiceListening}
                className={`h-20 w-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse ring-8 ring-rose-200 dark:ring-rose-950'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isListening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mt-4">
                {isListening ? 'Listening to your voice...' : 'Tap microphone to speak'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Say something like: &ldquo;Spent twelve hundred rupees on supermarket groceries yesterday&rdquo;
              </p>
            </div>

            {naturalText && (
              <div className="max-w-md mx-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">
                  Captured Speech:
                </span>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 italic">
                  &ldquo;{naturalText}&rdquo;
                </p>
              </div>
            )}

            {naturalText && (
              <Button
                variant="ai"
                onClick={handleExtractWithAI}
                disabled={aiAnalyzing}
                className="gap-2"
              >
                {aiAnalyzing ? 'Parsing Audio...' : 'Extract with AI'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode C & Review Stage: Interactive Editable Review Form */}
      {isReviewing && (
        <Card className="shadow-lg border-indigo-100 dark:border-indigo-950">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {entryMode === 'manual' ? 'Manual Transaction Entry' : 'Review & Confirm Extraction'}
                </CardTitle>
                <CardDescription className="text-xs">
                  Verify or edit transaction details before saving to your ledger.
                </CardDescription>
              </div>
              {aiExtractionMeta && (
                <Badge variant="outline" className="text-[11px] gap-1 bg-white dark:bg-slate-900">
                  <Sparkles className="h-3 w-3 text-indigo-600" />
                  AI Confidence: {Math.round((aiExtractionMeta.confidence || 0.9) * 100)}%
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            {/* Original Input Transparency Banner */}
            {originalInput && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">Original Input:</span>
                <p className="text-slate-700 dark:text-slate-300 italic mt-0.5">&ldquo;{originalInput}&rdquo;</p>
              </div>
            )}

            {/* Transaction Type: Expense vs Income */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransactionType('expense')}
                className={`py-2 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  transactionType === 'expense'
                    ? 'border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>Expense</span>
              </button>
              <button
                type="button"
                onClick={() => setTransactionType('income')}
                className={`py-2 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  transactionType === 'income'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>Income</span>
              </button>
            </div>

            {/* Amount and Currency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Amount (₹ INR) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-500" />
                  Category *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {categories
                    .filter((c) => c.category_type === transactionType)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Description & Merchant */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description / Item *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Weekly Grocery Run"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Merchant / Vendor (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Swiggy, Amazon, PVR"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
              </div>
            </div>

            {/* Essentiality Classification (For expenses) */}
            {transactionType === 'expense' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Essentiality Classification</span>
                  <span className="text-[11px] text-slate-400 font-normal">Contextual, non-judgmental</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEssentiality('essential');
                      setUserCorrected(true);
                    }}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      essentiality === 'essential'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold">Essential</div>
                    <div className="text-[10px] text-slate-500">Core necessities</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEssentiality('optimizable');
                      setUserCorrected(true);
                    }}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      essentiality === 'optimizable'
                        ? 'border-amber-600 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold">Optimizable</div>
                    <div className="text-[10px] text-slate-500">Could be reduced</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEssentiality('discretionary');
                      setUserCorrected(true);
                    }}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      essentiality === 'discretionary'
                        ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold">Discretionary</div>
                    <div className="text-[10px] text-slate-500">Optional leisure</div>
                  </button>
                </div>
              </div>
            )}

            {/* Date, Time, Payment Method */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Purchase Date
                </label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Time (Optional)
                </label>
                <Input
                  type="time"
                  value={purchaseTime}
                  onChange={(e) => setPurchaseTime(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Notes (Optional)
              </label>
              <Input
                type="text"
                placeholder="Additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                if (entryMode === 'manual') router.back();
                else setIsReviewing(false);
              }}
            >
              {entryMode === 'manual' ? 'Cancel' : 'Back to Edit Input'}
            </Button>

            <Button
              variant="ai"
              type="button"
              onClick={handleConfirmAndSave}
              disabled={saving}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving...' : 'Confirm & Save Transaction'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
