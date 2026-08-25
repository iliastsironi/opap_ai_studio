import React, { useState } from 'react';
import { EUR_DENOMINATIONS } from '../../services/financialCalculator.ts';
import { RotateCcw, Banknote, Coins as CoinsIcon, Calculator } from 'lucide-react';

export interface CashDenominationCounterProps {
  denominations: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
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
}) => {
  const [stepSize, setStepSize] = useState<number>(1);
  const [activeFilter, setActiveFilter] = useState<'all' | 'notes' | 'coins'>('all');

  // Handle count updates
  const updateCount = (key: string, delta: number) => {
    if (readOnly) return;
    const current = denominations[key] || 0;
    const nextVal = Math.max(0, current + delta);
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
    onChange({
      ...denominations,
      [key]: isNaN(parsed) || parsed < 0 ? 0 : parsed,
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

  // Subtotals
  let totalNotes = 0;
  let totalCoins = 0;

  EUR_DENOMINATIONS.forEach((d) => {
    const qty = denominations[d.key] || 0;
    const subtotal = qty * d.value;
    if (d.value >= 5) {
      totalNotes += subtotal;
    } else {
      totalCoins += subtotal;
    }
  });

  const grandTotal = totalNotes + totalCoins;

  const filteredDenominations = EUR_DENOMINATIONS.filter((d) => {
    if (activeFilter === 'notes') return d.value >= 5;
    if (activeFilter === 'coins') return d.value < 5;
    return true;
  });

  const isDark = theme === 'dark';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header Summary & Controls Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
          isDark
            ? 'bg-slate-800/90 border-slate-700 text-slate-100 shadow-md'
            : 'bg-white border-slate-200 text-slate-900 shadow-xs'
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
                : 'bg-indigo-50/90 border-indigo-150 text-indigo-950'
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

      {/* Main Grid matching the requested image design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {filteredDenominations.map((denom) => {
          const qty = denominations[denom.key] || 0;
          const subtotal = qty * denom.value;

          return (
            <div
              key={denom.key}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                isDark
                  ? 'bg-slate-900/80 border-slate-800 hover:border-indigo-600/60 shadow-2xs'
                  : 'bg-[#f8f9fe] border-slate-200/80 hover:border-indigo-300 shadow-2xs'
              }`}
            >
              {/* Card Header: Value & Subtotal Badge */}
              <div className="flex items-center justify-between">
                <span className={`text-base sm:text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {denom.label}
                </span>

                <span
                  className={`text-xs font-black font-mono px-3 py-1 rounded-lg border shadow-2xs ${
                    subtotal > 0
                      ? isDark
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                        : 'bg-indigo-100 text-indigo-950 border-indigo-200'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 border-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {subtotal.toFixed(2)} €
                </span>
              </div>

              {/* Counter Input Row */}
              <div
                className={`flex items-center p-1.5 rounded-xl border shadow-2xs transition-all gap-1 ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 focus-within:border-indigo-500'
                    : 'bg-white border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'
                }`}
              >
                <button
                  type="button"
                  disabled={readOnly || qty <= 0}
                  onClick={() => updateCount(denom.key, -1)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 active:scale-95 transition-all select-none ${
                    readOnly || qty <= 0
                      ? isDark ? 'bg-slate-900 text-slate-700 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 cursor-pointer' : 'bg-slate-100 text-slate-900 hover:bg-slate-200 cursor-pointer'
                  }`}
                  title="Μείωση κατά 1"
                >
                  -
                </button>

                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={readOnly}
                  value={qty === 0 ? '0' : qty}
                  onFocus={(e) => {
                    if (e.target.value === '0') {
                      e.target.select();
                    }
                  }}
                  onChange={(e) => setDirectCount(denom.key, e.target.value)}
                  placeholder="0"
                  className={`flex-1 min-w-0 px-1 text-center font-black font-mono text-base sm:text-lg bg-transparent border-none focus:outline-none focus:ring-0 ${
                    isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-950 placeholder:text-slate-500'
                  }`}
                />

                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => updateCount(denom.key, 1)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer shadow-2xs select-none shrink-0 ${
                    readOnly ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title="Αύξηση κατά 1"
                >
                  +
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => updateCount(denom.key, 5)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer select-none shrink-0 ${
                      isDark
                        ? 'bg-slate-800 text-indigo-300 hover:bg-indigo-900 hover:text-white'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                    }`}
                    title="Προσθήκη +5"
                  >
                    +5
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
