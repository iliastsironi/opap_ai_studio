import React from 'react';
import { formatCurrency } from '../../lib/formatters.ts';
import { SAFE_DENOMINATIONS, type SafeCount } from '../../lib/safeBundles.ts';

/**
 * Η καταμέτρηση του χρηματοκιβωτίου, όπως φαίνεται στην επιβεβαίωση και στις
 * λεπτομέρειες μιας βάρδιας.
 *
 * Δικό της κουτί, κάτω από το Σύνολο, και όχι μέσα του: αυτά τα χρήματα είναι
 * στο χρηματοκιβώτιο και δεν είναι μέρος του συρταριού που κρίνεται η βάρδια.
 * Αν έμπαιναν στο ισοζύγιο θα διαβάζονταν ως μετρητά για τα οποία η βάρδια
 * λογοδοτεί. Το «Χρηματοκιβώτιο» της γραμμής Ταμείο είναι άλλο πράγμα: οι
 * καταθέσεις που έγιναν κατά τη διάρκεια της βάρδιας.
 */
export const SafeCountSummary: React.FC<{ count: SafeCount | null }> = ({ count }) => {
  if (!count || count.total <= 0) return null;
  const lines = SAFE_DENOMINATIONS.filter((d) => (count.bundles[d.key] || 0) > 0);
  return (
    <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1" data-testid="safe-count-summary">
      <div className="text-center font-black text-slate-400 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
        Χρηματοκιβώτιο (δεσμίδες) — εκτός ισοζυγίου
      </div>
      {lines.map((d) => (
        <div key={d.key} className="flex justify-between text-slate-300 py-0.5">
          <span>
            {d.label}: {count.bundles[d.key]} × {count.sizes[d.key]} τμχ
          </span>
          <span className="font-mono font-bold text-white">
            {formatCurrency(count.bundles[d.key] * count.sizes[d.key] * d.value)}
          </span>
        </div>
      ))}
      <div className="flex justify-between text-slate-400 font-bold border-t border-slate-800 pt-1">
        <span>Σύνολο:</span>
        <span className="font-mono text-slate-200">{formatCurrency(count.total)}</span>
      </div>
    </div>
  );
};
