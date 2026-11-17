import React, { useState } from 'react';
import { EUR_DENOMINATIONS } from '../../services/financialCalculator.ts';
import { RotateCcw, Banknote, Coins as CoinsIcon, Calculator, Minus, Plus, Vault } from 'lucide-react';
import { MAX_DENOMINATION_QUANTITY } from '../../lib/limits.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import {
  MAX_BUNDLES,
  SAFE_DENOMINATIONS,
  normalizeBundleSizes,
  normalizeBundles,
  safeBundleCount,
  safePieceCount,
  safeTotal,
} from '../../lib/safeBundles.ts';

export interface CashDenominationCounterProps {
  denominations: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
  /**
   * Η τρίτη στήλη: το χρηματοκιβώτιο, σε δεσμίδες. Μετράνε ως μετρητά της
   * βάρδιας, κανονικά: μπαίνουν στο «Σύνολο Μετρητών». Αν λείπει, δεν υπάρχει η
   * στήλη (το κατάστημα την έχει κλειστή στη Διαμόρφωση).
   */
  safe?: {
    /** Δεσμίδες ανά αξία: {"5": 3, "50": 1}. */
    bundles: Record<string, number>;
    /** Τεμάχια ανά δεσμίδα ανά αξία, όπως τα όρισε ο admin. */
    sizes: Record<string, number>;
    onChange: (next: Record<string, number>) => void;
  };
  readOnly?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
}

export const CashDenominationCounter: React.FC<CashDenominationCounterProps> = ({
  denominations,
  onChange,
  readOnly = false,
  className = '',
  theme = 'light',
  safe,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'notes' | 'coins' | 'safe'>('all');

  // Η στήλη του χρηματοκιβωτίου. Δουλεύει με δεσμίδες, όχι με τεμάχια: το «3» στα
  // 50 € είναι τρεις δεσμίδες των 20 χαρτονομισμάτων.
  const safeBundles = normalizeBundles(safe?.bundles);
  const safeSizes = normalizeBundleSizes(safe?.sizes);
  const safeTotalEuro = safeTotal(safeBundles, safeSizes);
  const setSafeBundle = (key: string, value: number) => {
    if (readOnly || !safe) return;
    const clamped = Math.min(MAX_BUNDLES, Math.max(0, Math.floor(value) || 0));
    safe.onChange({ ...safeBundles, [key]: clamped });
  };

  // Handle count updates
  const updateCount = (key: string, delta: number) => {
    if (readOnly) return;
    const current = denominations[key] || 0;
    const nextVal = Math.min(MAX_DENOMINATION_QUANTITY, Math.max(0, current + delta));
    onChange({
      ...denominations,
      [key]: nextVal,
    });
  };

  const setDirectCount = (key: string, val: string) => {
    if (readOnly) return;
    if (val === '') {
      onChange({
        ...denominations,
        [key]: 0,
      });
      return;
    }
    const parsed = parseInt(val, 10);
    const clamped = isNaN(parsed) || parsed < 0 ? 0 : Math.min(MAX_DENOMINATION_QUANTITY, parsed);
    onChange({
      ...denominations,
      [key]: clamped,
    });
  };

  const handleReset = () => {
    if (readOnly) return;
    const resetObj: Record<string, number> = {};
    EUR_DENOMINATIONS.forEach((d) => {
      resetObj[d.key] = 0;
    });
    onChange(resetObj);
  };

  const handleResetBanknotes = () => {
    if (readOnly) return;
    const updated = { ...denominations };
    banknotes.forEach((b) => {
      updated[b.key] = 0;
    });
    onChange(updated);
  };

  const handleResetCoins = () => {
    if (readOnly) return;
    const updated = { ...denominations };
    coins.forEach((c) => {
      updated[c.key] = 0;
    });
    onChange(updated);
  };

  // Subtotals and counts
  let totalNotes = 0;
  let countNotes = 0;
  let totalCoins = 0;
  let countCoins = 0;

  EUR_DENOMINATIONS.forEach((d) => {
    const qty = denominations[d.key] || 0;
    const subtotal = qty * d.value;
    if (d.value >= 5) {
      totalNotes += subtotal;
      countNotes += qty;
    } else {
      totalCoins += subtotal;
      countCoins += qty;
    }
  });

  // Με τις δεσμίδες του χρηματοκιβωτίου, όταν η στήλη υπάρχει: είναι μετρητά της βάρδιας.
  const grandTotal = totalNotes + totalCoins + (safe ? safeTotalEuro : 0);
  // Coins run 2 € down to 0,05 €, notes run 5 € up to 500 €, each in its own
  // column. EUR_DENOMINATIONS is ordered high to low, which is already the
  // coin order; the notes are reversed so the column starts at the smallest.
  //
  // Two columns rather than a three-across grid also fixes the tab order:
  // Enter walks a column top to bottom instead of zig-zagging across rows.
  const banknotes = [...EUR_DENOMINATIONS.filter((d) => d.value >= 5)].reverse();
  const coins = EUR_DENOMINATIONS.filter((d) => d.value < 5);

  const isDark = theme === 'dark';

  const renderDenomCard = (
    denom: (typeof EUR_DENOMINATIONS)[number],
    isCoin: boolean
  ) => {
    const qty = denominations[denom.key] || 0;
    const subtotal = qty * denom.value;

    return (
      <div
        key={denom.key}
        className={`transition px-2.5 py-1.5 rounded-xl border flex flex-wrap items-center gap-x-2 gap-y-1.5 ${
          isDark
            ? isCoin
              ? 'bg-slate-900/90 border-amber-900/30 hover:border-amber-600/50 shadow-2xs'
              : 'bg-slate-900/90 border-emerald-900/30 hover:border-emerald-600/50 shadow-2xs'
            : isCoin
            ? 'bg-white border-amber-200/90 hover:border-amber-400 hover:shadow-xs'
            : 'bg-white border-emerald-200/90 hover:border-emerald-400 hover:shadow-xs'
        }`}
      >
        {/* One line per denomination - value, running subtotal, stepper.
            Thirteen of these as two-row cards three across was most of a
            screen, and a till gets counted on a phone as often as a desk. */}
        <div className="flex items-center gap-1.5 min-w-[5.5rem] flex-1">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
                isCoin
                  ? isDark
                    ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                  : isDark
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isCoin ? <CoinsIcon className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
            </div>
            <span
              className={`text-xs font-black tracking-tight truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {denom.label}
            </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 justify-end">
          <span
            className={`text-xs font-black font-mono px-2.5 py-1 rounded-lg border shadow-2xs shrink-0 ${
              subtotal > 0
                ? isCoin
                  ? isDark
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-amber-50 text-amber-900 border-amber-300 font-black'
                  : isDark
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-black'
                : isDark
                ? 'bg-slate-900 text-slate-500 border-slate-800'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {formatCurrency(subtotal)}
          </span>
        </div>

        {/* Counter Stepper Row */}
        <div
          className={`flex items-center p-0.5 rounded-lg border shadow-2xs transition-colors gap-0.5 w-full @sm:w-auto @sm:shrink-0 ${
            isDark
              ? 'bg-slate-950 border-slate-700 focus-within:border-brand'
              : 'bg-slate-50/90 border-slate-200 focus-within:bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-indigo-100'
          }`}
        >
          <button
            type="button"
            disabled={readOnly || qty <= 0}
            onClick={() => updateCount(denom.key, -1)}
            className={`w-7 h-7 rounded-md flex items-center justify-center font-black text-base shrink-0 active:scale-95 transition-all select-none ${
              readOnly || qty <= 0
                ? isDark
                  ? 'bg-slate-900 text-slate-700 cursor-not-allowed'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                : isDark
                ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 cursor-pointer'
                : 'bg-white text-slate-800 hover:bg-slate-200 border border-slate-200/80 cursor-pointer'
            }`}
            title="Μείωση κατά 1 (-1)"
            aria-label="Μείωση κατά 1"
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="flex-1 @sm:flex-none @sm:w-14 flex items-center justify-center px-0.5">
            <input
              type="number"
              min="0"
              max={MAX_DENOMINATION_QUANTITY}
              step="1"
              disabled={readOnly}
              value={qty === 0 ? '0' : qty}
              onFocus={(e) => {
                e.target.select();
              }}
              onChange={(e) => setDirectCount(denom.key, e.target.value)}
              placeholder="0"
              className={`w-full min-w-0 text-center font-black font-mono text-sm bg-transparent border-none focus:outline-hidden focus:ring-0 p-0 ${
                isDark
                  ? 'text-white placeholder:text-slate-600'
                  : 'text-slate-900 placeholder:text-slate-500'
              }`}
            />

          </div>

          <button
            type="button"
            disabled={readOnly || qty >= MAX_DENOMINATION_QUANTITY}
            onClick={() => updateCount(denom.key, 1)}
            className={`w-7 h-7 rounded-md flex items-center justify-center font-black text-base text-white active:scale-95 transition-all select-none shrink-0 ${
              readOnly || qty >= MAX_DENOMINATION_QUANTITY
                ? 'bg-slate-300 cursor-not-allowed'
                : `cursor-pointer shadow-2xs ${isCoin ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`
            }`}
            title={qty >= MAX_DENOMINATION_QUANTITY ? `Μέγιστη ποσότητα (${MAX_DENOMINATION_QUANTITY})` : 'Αύξηση κατά 1 (+1)'}
            aria-label="Αύξηση κατά 1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderSafeRow = (denom: (typeof SAFE_DENOMINATIONS)[number]) => {
    const bundles = safeBundles[denom.key] || 0;
    const size = safeSizes[denom.key];
    const perBundle = size * denom.value;
    const subtotal = bundles * perBundle;
    return (
      <div
        key={denom.key}
        className={`transition px-2.5 py-1.5 rounded-xl border flex flex-wrap items-center gap-x-2 gap-y-1.5 ${
          isDark
            ? 'bg-slate-900/90 border-slate-700 hover:border-slate-500 shadow-2xs'
            : 'bg-white border-slate-300/90 hover:border-slate-500 hover:shadow-xs'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-[7rem] flex-1">
          <div
            className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
              isDark ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'bg-slate-100 text-slate-700 border border-slate-300'
            }`}
          >
            <Banknote className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <span className={`block text-xs font-black tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {denom.label}
            </span>
            {/* Τι είναι μία δεσμίδα, γραμμένο στη γραμμή: ο υπάλληλος δεν
                πρέπει να θυμάται ότι τα 50 € είναι των 20 και τα 20 € των 50. */}
            <span className={`block text-micro leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              δεσμίδα {size} τμχ ({formatCurrency(perBundle)})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 justify-end">
          <span
            className={`text-xs font-black font-mono px-2.5 py-1 rounded-lg border shadow-2xs shrink-0 ${
              subtotal > 0
                ? isDark
                  ? 'bg-slate-800 text-slate-100 border-slate-500'
                  : 'bg-slate-900 text-white border-slate-900'
                : isDark
                ? 'bg-slate-900 text-slate-500 border-slate-800'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {formatCurrency(subtotal)}
          </span>
        </div>

        <div
          className={`flex items-center p-0.5 rounded-lg border shadow-2xs transition-colors gap-0.5 w-full @sm:w-auto @sm:shrink-0 ${
            isDark
              ? 'bg-slate-950 border-slate-700 focus-within:border-brand'
              : 'bg-slate-50/90 border-slate-200 focus-within:bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-indigo-100'
          }`}
        >
          <button
            type="button"
            disabled={readOnly || bundles <= 0}
            onClick={() => setSafeBundle(denom.key, bundles - 1)}
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 active:scale-95 transition-all select-none ${
              readOnly || bundles <= 0
                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-white text-slate-800 hover:bg-slate-200 border border-slate-200/80 cursor-pointer'
            }`}
            title="Μείωση κατά 1 δεσμίδα"
            aria-label={`Μείωση δεσμίδων των ${denom.label}`}
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex-1 @sm:flex-none @sm:w-12 flex items-center justify-center px-0.5">
            <input
              type="number"
              min="0"
              max={MAX_BUNDLES}
              step="1"
              disabled={readOnly}
              value={bundles === 0 ? '0' : bundles}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setSafeBundle(denom.key, e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
              aria-label={`Δεσμίδες των ${denom.label}`}
              className={`w-full min-w-0 text-center font-black font-mono text-sm bg-transparent border-none focus:outline-hidden focus:ring-0 p-0 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            />
          </div>
          <button
            type="button"
            disabled={readOnly || bundles >= MAX_BUNDLES}
            onClick={() => setSafeBundle(denom.key, bundles + 1)}
            className={`w-7 h-7 rounded-md flex items-center justify-center text-white active:scale-95 transition-all select-none shrink-0 ${
              readOnly || bundles >= MAX_BUNDLES
                ? 'bg-slate-300 cursor-not-allowed'
                : 'cursor-pointer shadow-2xs bg-slate-800 hover:bg-slate-900'
            }`}
            title="Αύξηση κατά 1 δεσμίδα"
            aria-label={`Αύξηση δεσμίδων των ${denom.label}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header Summary & Controls Bar */}
      <div
        className={`transition p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-800/90 border-slate-700 text-slate-100 shadow-md'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
              isDark ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/50' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
            }`}
          >
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold uppercase tracking-wide">
              Καταμετρητής Χαρτονομισμάτων & Κερμάτων (EUR)
            </h4>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Εισάγετε τις ποσότητες για αυτόματο υπολογισμό συνόλου
            </p>
          </div>
        </div>

        {/* Totals & Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          {/* Quick Filter Tabs */}
          <div className={`flex items-center p-1 rounded-xl border text-xs ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? isDark ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 shadow-2xs'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Όλα
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('notes')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center space-x-1 cursor-pointer ${
                activeFilter === 'notes'
                  ? isDark ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 shadow-2xs'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Χαρτονομίσματα</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('coins')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center space-x-1 cursor-pointer ${
                activeFilter === 'coins'
                  ? isDark ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 shadow-2xs'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CoinsIcon className="w-3.5 h-3.5" />
              <span>Κέρματα</span>
            </button>
            {safe && (
              <button
                type="button"
                onClick={() => setActiveFilter('safe')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center space-x-1 cursor-pointer ${
                  activeFilter === 'safe'
                    ? isDark ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 shadow-2xs'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Vault className="w-3.5 h-3.5" />
                <span>Χρηματοκιβώτιο</span>
              </button>
            )}
          </div>

          {/* Reset Button */}
          {!readOnly && (
            <button
              type="button"
              onClick={handleReset}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-rose-950/60 hover:border-rose-800 hover:text-rose-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'
              }`}
              title={safe ? 'Μηδενισμός κερμάτων και χαρτονομισμάτων (όχι των δεσμίδων του χρηματοκιβωτίου)' : 'Μηδενισμός όλων των ποσοτήτων'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Μηδενισμός</span>
            </button>
          )}

          {/* Total Badge */}
          <div
            className={`px-4 py-2 rounded-xl border flex flex-col text-right ${
              isDark
                ? 'bg-indigo-950/60 border-indigo-800/80 text-indigo-300'
                : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
            }`}
          >
            <span className="text-micro font-extrabold uppercase tracking-wider block opacity-80">
              Σύνολο Μετρητών
            </span>
            <span className="text-xl font-black font-mono leading-tight">
              {formatCurrency(grandTotal)}
            </span>
          </div>

          {/* Το χρηματοκιβώτιο είναι ήδη μέσα στο Σύνολο Μετρητών δίπλα: εδώ φαίνεται
              πόσο από αυτό είναι δεσμίδες. */}
          {safe && (
            <div
              className={`px-4 py-2 rounded-xl border flex flex-col text-right ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
              title="Οι δεσμίδες του χρηματοκιβωτίου μετράνε ως μετρητά: είναι μέσα στο Σύνολο Μετρητών."
            >
              <span className="text-micro font-extrabold uppercase tracking-wider block opacity-80">
                Εκ των οποίων χρηματοκιβώτιο
              </span>
              <span className="text-xl font-black font-mono leading-tight">{formatCurrency(safeTotalEuro)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Κέρματα αριστερά, χαρτονομίσματα δεξιά. Counting a drawer goes down
          the coins and up the notes, and the two lists are read side by side
          rather than one under the other. */}
      <div className={`grid grid-cols-1 gap-4 items-start ${safe ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {/* SECTION 2: COINS (ΚΕΡΜΑΤΑ 2€ - 0,05€) */}
        {(activeFilter === 'all' || activeFilter === 'coins') && (
          <div
            className={`@container transition p-4 sm:p-5 rounded-2xl border space-y-4 ${
              isDark
                ? 'bg-slate-900/60 border-amber-900/40 shadow-sm'
                : 'bg-amber-50/25 border-amber-200/80 shadow-2xs'
            }`}
          >
            {/* Coins Section Header */}
            <div className="flex items-center justify-between border-b border-amber-200/60 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                    isDark
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  <CoinsIcon className="w-5 h-5" />
                </div>
                <div>
                  <h5
                    className={`font-black text-sm uppercase tracking-wide flex items-center space-x-2 ${
                      isDark ? 'text-amber-300' : 'text-amber-950'
                    }`}
                  >
                    <span>Κέρματα</span>
                    <span className="text-xs font-normal opacity-70 font-mono">(2€ - 0,10€)</span>
                  </h5>
                  <p className={`text-micro font-medium ${isDark ? 'text-amber-400/80' : 'text-amber-700/80'}`}>
                    Καταμέτρηση κερμάτων και υποδιαιρέσεων
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && countCoins > 0 && (
                  <button
                    type="button"
                    onClick={handleResetCoins}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-300 border border-slate-700'
                        : 'bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-amber-200 shadow-2xs'
                    }`}
                    title="Μηδενισμός μόνο των κερμάτων"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Μηδενισμός</span>
                  </button>
                )}
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono whitespace-nowrap ${
                    isDark
                      ? 'bg-slate-900 text-slate-300 border-slate-700'
                      : 'bg-white text-slate-700 border-amber-200'
                  }`}
                >
                  {countCoins} τμχ
                </span>
                <span
                  className={`text-xs sm:text-sm font-black font-mono px-3.5 py-1.5 rounded-xl border shadow-2xs whitespace-nowrap ${
                    totalCoins > 0
                      ? isDark
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 border-slate-700'
                      : 'bg-white text-amber-950 border-amber-200'
                  }`}
                >
                  Σύνολο: {formatCurrency(totalCoins)}
                </span>
              </div>
            </div>

            {/* Coins Grid */}
            <div className="space-y-2">
              {coins.map((denom) => renderDenomCard(denom, true))}
            </div>
          </div>
        )}

        {/* SECTION 1: BANKNOTES (ΧΑΡΤΟΝΟΜΙΣΜΑΤΑ) */}
        {(activeFilter === 'all' || activeFilter === 'notes') && (
          <div
            className={`@container transition p-4 sm:p-5 rounded-2xl border space-y-4 ${
              isDark
                ? 'bg-slate-900/60 border-emerald-900/40 shadow-sm'
                : 'bg-emerald-50/25 border-emerald-200/80 shadow-2xs'
            }`}
          >
            {/* Banknotes Section Header */}
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                    isDark
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h5
                    className={`font-black text-sm uppercase tracking-wide flex items-center space-x-2 ${
                      isDark ? 'text-emerald-300' : 'text-emerald-950'
                    }`}
                  >
                    <span>Χαρτονομίσματα</span>
                    <span className="text-xs font-normal opacity-70 font-mono">(500€ - 5€)</span>
                  </h5>
                  <p className={`text-micro font-medium ${isDark ? 'text-emerald-400/80' : 'text-emerald-700/80'}`}>
                    Καταμέτρηση χαρτονομισμάτων ταμείου
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && countNotes > 0 && (
                  <button
                    type="button"
                    onClick={handleResetBanknotes}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-300 border border-slate-700'
                        : 'bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-emerald-200 shadow-2xs'
                    }`}
                    title="Μηδενισμός μόνο των χαρτονομισμάτων"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Μηδενισμός</span>
                  </button>
                )}
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono whitespace-nowrap ${
                    isDark
                      ? 'bg-slate-900 text-slate-300 border-slate-700'
                      : 'bg-white text-slate-700 border-emerald-200'
                  }`}
                >
                  {countNotes} τμχ
                </span>
                <span
                  className={`text-xs sm:text-sm font-black font-mono px-3.5 py-1.5 rounded-xl border shadow-2xs whitespace-nowrap ${
                    totalNotes > 0
                      ? isDark
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 border-slate-700'
                      : 'bg-white text-emerald-950 border-emerald-200'
                  }`}
                >
                  Σύνολο: {formatCurrency(totalNotes)}
                </span>
              </div>
            </div>

            {/* Banknotes Grid */}
            <div className="space-y-2">
              {banknotes.map((denom) => renderDenomCard(denom, false))}
            </div>
          </div>
        )}

        {/* SECTION 3: ΧΡΗΜΑΤΟΚΙΒΩΤΙΟ - σε δεσμίδες, ξεχωριστά από το συρτάρι */}
        {safe && (activeFilter === 'all' || activeFilter === 'safe') && (
          <div
            className={`@container transition p-4 sm:p-5 rounded-2xl border space-y-4 ${
              isDark ? 'bg-slate-900/60 border-slate-700 shadow-sm' : 'bg-slate-50/60 border-slate-300/80 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                    isDark ? 'bg-slate-800 text-slate-200 border border-slate-600' : 'bg-slate-900 text-white border border-slate-900'
                  }`}
                >
                  <Vault className="w-5 h-5" />
                </div>
                <div>
                  <h5
                    className={`font-black text-sm uppercase tracking-wide flex items-center space-x-2 ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    <span>Χρηματοκιβώτιο</span>
                    <span className="text-xs font-normal opacity-70 font-mono">(δεσμίδες)</span>
                  </h5>
                  <p className={`text-micro font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Μετράνε ως μετρητά της βάρδιας
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && safeBundleCount(safeBundles) > 0 && (
                  <button
                    type="button"
                    onClick={() => safe.onChange(normalizeBundles({}))}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer select-none whitespace-nowrap bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-300 shadow-2xs"
                    title="Μηδενισμός μόνο του χρηματοκιβωτίου"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Μηδενισμός</span>
                  </button>
                )}
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border font-mono whitespace-nowrap bg-white text-slate-700 border-slate-300"
                  title={`${safePieceCount(safeBundles, safeSizes)} χαρτονομίσματα`}
                >
                  {safeBundleCount(safeBundles)} δεσμ.
                </span>
                <span
                  className={`text-xs sm:text-sm font-black font-mono px-3.5 py-1.5 rounded-xl border shadow-2xs whitespace-nowrap ${
                    safeTotalEuro > 0
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  Σύνολο: {formatCurrency(safeTotalEuro)}
                </span>
              </div>
            </div>

            <div className="space-y-2">{SAFE_DENOMINATIONS.map((denom) => renderSafeRow(denom))}</div>
          </div>
        )}
      </div>
    </div>
  );
};
