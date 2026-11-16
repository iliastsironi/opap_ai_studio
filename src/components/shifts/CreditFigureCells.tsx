import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { debtUsage, type DebtTone } from '../../lib/debtUsage.ts';

/**
 * Τα τρία νούμερα ενός πελάτη στο τεφτέρι: όριο, τρέχουσα οφειλή, υπόλοιπο ορίου.
 *
 * ΜΟΝΟ η οφειλή έχει χρώμα (δες lib/debtUsage.ts για τον κανόνα). Το όριο και
 * το υπόλοιπο είναι απλά νούμερα στο ίδιο ουδέτερο χρώμα: όταν και οι τρεις
 * στήλες είχαν χρώμα, δεν ήταν φανερό ποια από τις τρεις είναι η προειδοποίηση.
 *
 * Το χρώμα δεν είναι ο μοναδικός τρόπος να διαβαστεί: το ποσοστό είναι στο
 * title (και στο aria-label) του νούμερου.
 */

const TONE_CLASSES: Record<DebtTone, string> = {
  GREEN: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
  ORANGE: 'bg-orange-100 text-orange-800 border border-orange-300',
  RED: 'bg-rose-100 text-rose-800 border border-rose-300',
};

interface Props {
  debt: number;
  limit: number;
  isUnlimited: boolean;
}

/**
 * Η τρέχουσα οφειλή, χρωματισμένη ως ποσοστό του ορίου. Το ΜΟΝΟ νούμερο που
 * παίρνει χρώμα, στο τεφτέρι και στη γραμμή πελάτη της βάρδιας.
 */
export const DebtFigure: React.FC<Props> = ({ debt, limit, isUnlimited }) => {
  const usage = debtUsage(debt, limit, isUnlimited);

  const hint =
    usage.percent !== null
      ? `${usage.percent}% του ορίου`
      : usage.over
        ? 'Το όριο είναι 0 €'
        : undefined;

  return (
    <span
      data-debt-tone={usage.tone ?? 'NONE'}
      title={hint}
      aria-label={hint ? `${formatCurrency(debt)} — ${hint}` : undefined}
      className={`font-black px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
        usage.tone ? TONE_CLASSES[usage.tone] : 'text-slate-800'
      }`}
    >
      {usage.over && <AlertTriangle className="w-3 h-3 shrink-0" />}
      {formatCurrency(debt)}
      {usage.over && <span className="font-sans font-bold text-micro uppercase">Υπέρβαση</span>}
    </span>
  );
};

export const CreditFigureCells: React.FC<Props> = ({ debt, limit, isUnlimited }) => {
  const remaining = isUnlimited ? null : Math.max(0, limit - debt);

  return (
    <>
      <td className="p-3 text-right font-mono font-bold text-slate-700">
        {isUnlimited ? 'Απεριόριστο' : formatCurrency(limit)}
      </td>

      <td className="p-3 text-right font-mono">
        <DebtFigure debt={debt} limit={limit} isUnlimited={isUnlimited} />
      </td>

      <td className="p-3 text-right font-mono font-bold text-slate-700">
        {remaining === null ? 'Απεριόριστο' : formatCurrency(remaining)}
      </td>
    </>
  );
};
