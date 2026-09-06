import React, { useState } from 'react';
import { EUR_DENOMINATIONS } from '../../services/financialCalculator.ts';
import { RotateCcw, Banknote, Coins as CoinsIcon, Calculator, Minus, Plus, X } from 'lucide-react';

export interface CashDenominationCounterProps {
  denominations: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
  readOnly?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
}

// Ceiling per denomination, not just a floor of 0. Nothing enforced an upper
// bound before, so a fat-fingered extra digit (e.g. 4440 instead of 444)
// silently produced a five-figure subtotal for a single denomination. 999
// still comfortably covers real per-denomination piece counts (coin bags in
// particular routinely run into the hundreds) while blocking that whole
// class of typo.
const MAX_QUANTITY = 999;

export const CashDenominationCounter: React.FC<CashDenominationCounterProps> = ({
  denominations,
  onChange,
  readOnly = false,
  className = '',
  theme = 'light',
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'notes' | 'coins'>('all');

  // Handle count updates
  const updateCount = (key: string, delta: number) => {
    if (readOnly) return;
    const current = denominations[key] || 0;
    const nextVal = Math.min(MAX_QUANTITY, Math.max(0, current + delta));
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
    const clamped = isNaN(parsed) || parsed < 0 ? 0 : Math.min(MAX_QUANTITY, parsed);
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

  const grandTotal = totalNotes + totalCoins;
  const banknotes = EUR_DENOMINATIONS.filter((d) => d.value >= 5);
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
        className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
          isDark
            ? isCoin
              ? 'bg-slate-900/90 border-amber-900/30 hover:border-amber-600/50 shadow-2xs'
              : 'bg-slate-900/90 border-emerald-900/30 hover:border-emerald-600/50 shadow-2xs'
            : isCoin
            ? 'bg-white border-amber-200/90 hover:border-amber-400 hover:shadow-xs'
            : 'bg-white border-emerald-200/90 hover:border-emerald-400 hover:shadow-xs'
        }`}
      >
        {/* Card Header: Value & Subtotal Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                isCoin
                  ? isDark
                    ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                  : isDark
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isCoin ? <CoinsIcon className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
            </div>
            <span
              className={`text-sm font-black tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {denom.label}
            </span>
          </div>

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
            {subtotal.toFixed(2)} €
          </span>
        </div>

        {/* Counter Stepper Row */}
        <div
          className={`flex items-center p-1 rounded-xl border shadow-2xs transition-all gap-2 ${
            isDark
              ? 'bg-slate-950 border-slate-700 focus-within:border-indigo-500'
              : 'bg-slate-50/90 border-slate-200 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'
          }`}
        >
          <button
            type="button"
            disabled={readOnly || qty <= 0}
            onClick={() => updateCount(denom.key, -1)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base shrink-0 active:scale-95 transition-all select-none ${
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

          <div className="flex-1 min-w-14 flex items-center justify-center px-1">
            <input
              type="number"
              min="0"
              max={MAX_QUANTITY}
              step="1"
              disabled={readOnly}
              value={qty === 0 ? '0' : qty}
              onFocus={(e) => {
                e.target.select();
              }}
              onChange={(e) => setDirectCount(denom.key, e.target.value)}
              placeholder="0"
              className={`w-full min-w-0 text-center font-black font-mono text-lg bg-transparent border-none focus:outline-hidden focus:ring-0 p-0 ${
                isDark
                  ? 'text-white placeholder:text-slate-600'
                  : 'text-slate-900 placeholder:text-slate-400'
              }`}
            />
            <span className={`text-[11px] font-bold ml-1 select-none shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              τμχ
            </span>
          </div>

          <button
            type="button"
            disabled={readOnly || qty >= MAX_QUANTITY}
            onClick={() => updateCount(denom.key, 1)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base text-white active:scale-95 transition-all select-none shrink-0 ${
              readOnly || qty >= MAX_QUANTITY
                ? 'bg-slate-300 cursor-not-allowed'
                : `cursor-pointer shadow-2xs ${isCoin ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`
            }`}
            title={qty >= MAX_QUANTITY ? `Μέγιστη ποσότητα (${MAX_QUANTITY})` : 'Αύξηση κατά 1 (+1)'}
            aria-label="Αύξηση κατά 1"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Reset-to-zero for this one denomination - kept separate from the
              removed +5/+10/+20 shortcuts, which were redundant once the
              count field itself takes direct numeric entry. */}
          {!readOnly && qty > 0 && (
            <button
              type="button"
              onClick={() => updateCount(denom.key, -qty)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all cursor-pointer select-none shrink-0 ${
                isDark
                  ? 'text-rose-400 hover:bg-rose-950 hover:text-rose-200'
                  : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
              }`}
              title="Μηδενισμός αξίας"
              aria-label="Μηδενισμός αξίας"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header Summary & Controls Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
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
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center space-x-1 cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                activeFilter === 'coins'
                  ? isDark ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 shadow-2xs'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CoinsIcon className="w-3.5 h-3.5" />
              <span>Κέρματα</span>
            </button>
          </div>

          {/* Reset Button */}
          {!readOnly && (
            <button
              type="button"
              onClick={handleReset}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-rose-950/60 hover:border-rose-800 hover:text-rose-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'
              }`}
              title="Μηδενισμός όλων των ποσοτήτων"
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
            <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-80">
              Σύνολο Μετρητών
            </span>
            <span className="text-xl font-black font-mono leading-tight">
              {grandTotal.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>

      {/* Two Distinct Sections: Banknotes & Coins */}
      <div className="space-y-6">
        {/* SECTION 1: BANKNOTES (ΧΑΡΤΟΝΟΜΙΣΜΑΤΑ) */}
        {(activeFilter === 'all' || activeFilter === 'notes') && (
          <div
            className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-4 ${
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
                  <p className={`text-[11px] font-medium ${isDark ? 'text-emerald-400/80' : 'text-emerald-700/80'}`}>
                    Καταμέτρηση χαρτονομισμάτων ταμείου
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!readOnly && countNotes > 0 && (
                  <button
                    type="button"
                    onClick={handleResetBanknotes}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none ${
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
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${
                    isDark
                      ? 'bg-slate-900 text-slate-300 border-slate-700'
                      : 'bg-white text-slate-700 border-emerald-200'
                  }`}
                >
                  {countNotes} τμχ
                </span>
                <span
                  className={`text-xs sm:text-sm font-black font-mono px-3.5 py-1.5 rounded-xl border shadow-2xs ${
                    totalNotes > 0
                      ? isDark
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 border-slate-700'
                      : 'bg-white text-emerald-950 border-emerald-200'
                  }`}
                >
                  Σύνολο: {totalNotes.toFixed(2)} €
                </span>
              </div>
            </div>

            {/* Banknotes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5">
              {banknotes.map((denom) => renderDenomCard(denom, false))}
            </div>
          </div>
        )}

        {/* SECTION 2: COINS (ΚΕΡΜΑΤΑ 2€ - 0.10€) */}
        {(activeFilter === 'all' || activeFilter === 'coins') && (
          <div
            className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-4 ${
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
                  <p className={`text-[11px] font-medium ${isDark ? 'text-amber-400/80' : 'text-amber-700/80'}`}>
                    Καταμέτρηση κερμάτων και υποδιαιρέσεων
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!readOnly && countCoins > 0 && (
                  <button
                    type="button"
                    onClick={handleResetCoins}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer select-none ${
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
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${
                    isDark
                      ? 'bg-slate-900 text-slate-300 border-slate-700'
                      : 'bg-white text-slate-700 border-amber-200'
                  }`}
                >
                  {countCoins} τμχ
                </span>
                <span
                  className={`text-xs sm:text-sm font-black font-mono px-3.5 py-1.5 rounded-xl border shadow-2xs ${
                    totalCoins > 0
                      ? isDark
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 border-slate-700'
                      : 'bg-white text-amber-950 border-amber-200'
                  }`}
                >
                  Σύνολο: {totalCoins.toFixed(2)} €
                </span>
              </div>
            </div>

            {/* Coins Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5">
              {coins.map((denom) => renderDenomCard(denom, true))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
