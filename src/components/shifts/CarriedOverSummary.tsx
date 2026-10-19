import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';

/**
 * What earlier shifts of the same day already recorded, as one line.
 *
 * Expenses and customer charges carry through a day - the second shift
 * reconciles against the same figures as the first, so it has to see them.
 * Listing them again in full buries this shift's own entries in somebody
 * else's, and the operator starts wondering whether to re-enter them.
 *
 * So they collapse to a total and open on request. Read-only on purpose:
 * they belong to a shift that is already closed, and the only honest way to
 * change one is to correct that shift.
 */
export interface CarriedRow {
  id: string;
  label: string;
  amount: number;
  /** Shown under the label - who entered it, or what kind it is. */
  detail?: string;
  /** Rendered in the opposite direction, for returns against charges. */
  negative?: boolean;
}

export const CarriedOverSummary: React.FC<{
  title: string;
  rows: CarriedRow[];
  /** Overrides the sum, for a total that nets two directions. */
  total?: number;
  tone?: 'slate' | 'amber';
  emptyHint?: string;
}> = ({ title, rows, total, tone = 'slate', emptyHint }) => {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) {
    return emptyHint ? <p className="text-micro text-slate-400">{emptyHint}</p> : null;
  }

  const sum = total ?? rows.reduce((a, r) => a + (r.negative ? -r.amount : r.amount), 0);
  const palette = tone === 'amber'
    ? { box: 'bg-amber-50/70 border-amber-200', head: 'text-amber-950', sub: 'text-amber-900/70' }
    : { box: 'bg-slate-50 border-slate-200', head: 'text-slate-800', sub: 'text-slate-500' };

  return (
    <div className={`rounded-2xl border ${palette.box}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-3 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />
          )}
          <span className="min-w-0">
            <span className={`block text-xs font-black ${palette.head}`}>{title}</span>
            <span className={`block text-micro ${palette.sub}`}>
              {rows.length} {rows.length === 1 ? 'εγγραφή' : 'εγγραφές'} · πατήστε για ανάλυση
            </span>
          </span>
        </span>
        <span className={`text-sm font-black font-mono shrink-0 ${palette.head}`}>
          {formatCurrency(sum)}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-micro text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-200/80">
            <Lock className="w-3 h-3 shrink-0" />
            Ανήκουν σε κλεισμένη βάρδια — διορθώνονται μόνο από εκείνη.
          </p>
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800 truncate">{r.label}</span>
                {r.detail && (
                  <span className="block text-micro text-slate-500 truncate">{r.detail}</span>
                )}
              </span>
              <span
                className={`text-xs font-black font-mono shrink-0 ${
                  r.negative ? 'text-emerald-700' : 'text-slate-900'
                }`}
              >
                {r.negative ? '-' : ''}
                {formatCurrency(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
