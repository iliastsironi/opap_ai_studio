import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_SCRATCH_PRESETS,
  isLotteryRow,
  type ScratchTicketRow,
} from './ScratchCalculatorTable.tsx';
import { fetchScratchCatalog, saveScratchCatalog } from '../../services/scratchCatalogService.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';

/**
 * The Owner's list of games: what the store sells, what each costs, and the
 * order the till counts them in.
 *
 * Until 0030 this list was only ever in localStorage, edited incidentally from
 * inside the closing wizard - which meant the person counting the till was the
 * person maintaining the catalogue, on their own device.
 */
export const ScratchCatalogEditor: React.FC<{
  orgId: string;
  storeId: string | null;
  canEdit: boolean;
}> = ({ orgId, storeId, canEdit }) => {
  const [rows, setRows] = useState<ScratchTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScratchCatalog(orgId, storeId ?? undefined)
      .then((catalog) => {
        if (!cancelled) setRows(catalog);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, storeId]);

  const update = (index: number, patch: Partial<ScratchTicketRow>) => {
    setMessage(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setMessage(null);
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addGame = () => {
    setMessage(null);
    setRows((prev) => [
      ...prev,
      {
        // Stable and unique: the catalogue is keyed on this, and a game added
        // on two devices at once must not collide on one id.
        id: `scr_custom_${Date.now().toString(36)}`,
        name: '',
        category: 'Σκρατς',
        kind: 'SCRATCH',
        price: 0,
        startNo: '',
        endNo: '',
      },
    ]);
  };

  const removeGame = (index: number) => {
    setMessage(null);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const restorePresets = () => {
    setMessage(null);
    setRows(DEFAULT_SCRATCH_PRESETS.map((r) => ({ ...r })));
  };

  const save = async () => {
    const unnamed = rows.findIndex((r) => !r.name.trim());
    if (unnamed !== -1) {
      setError(`Η γραμμή ${unnamed + 1} δεν έχει όνομα παιχνιδιού.`);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveScratchCatalog(orgId, storeId, rows);
      setMessage('Ο κατάλογος αποθηκεύτηκε. Ισχύει αμέσως σε κάθε συσκευή.');
    } catch (err: any) {
      setError(err?.message || 'Η αποθήκευση του καταλόγου απέτυχε');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500 text-xs font-bold gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Φόρτωση καταλόγου…
      </div>
    );
  }

  const scratchCount = rows.filter((r) => !isLotteryRow(r)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm">Κατάλογος Σκρατς & Λαχείων</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length} παιχνίδια — {scratchCount} σκρατς, {rows.length - scratchCount} λαχεία.
            Η σειρά εδώ είναι η σειρά που μετράει το ταμείο.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={restorePresets}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Επαναφορά προεπιλογών
            </button>
            <button
              type="button"
              onClick={addGame}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Προσθήκη παιχνιδιού
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Αποθήκευση καταλόγου
            </button>
          </div>
        )}
      </div>

      {!canEdit && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Μόνο ο ιδιοκτήτης μπορεί να αλλάξει τον κατάλογο. Βλέπετε τι ισχύει.
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>
      )}
      {message && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{message}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-micro font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <th className="py-2 pr-2 w-16">Σειρά</th>
              <th className="py-2 pr-2">Παιχνίδι</th>
              <th className="py-2 pr-2 w-32">Είδος</th>
              <th className="py-2 pr-2 w-28">Κατηγορία</th>
              <th className="py-2 pr-2 w-24">Τιμή (€)</th>
              <th className="py-2 pr-2 w-24">Πακέτο</th>
              <th className="py-2 pr-2 w-20">Πίσω</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={!canEdit || index === 0}
                      aria-label={`Μετακίνηση του ${row.name || 'παιχνιδιού'} πιο πάνω`}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={!canEdit || index === rows.length - 1}
                      aria-label={`Μετακίνηση του ${row.name || 'παιχνιδιού'} πιο κάτω`}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={row.name}
                    maxLength={MAX_LABEL_LENGTH}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder="Όνομα παιχνιδιού"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 bg-white disabled:bg-slate-50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={row.kind ?? (isLotteryRow(row) ? 'LOTTERY' : 'SCRATCH')}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { kind: e.target.value as 'SCRATCH' | 'LOTTERY' })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 bg-white disabled:bg-slate-50 cursor-pointer"
                  >
                    <option value="SCRATCH">Σκρατς</option>
                    <option value="LOTTERY">Λαχείο</option>
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={row.category ?? ''}
                    maxLength={MAX_LABEL_LENGTH}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { category: e.target.value })}
                    placeholder="Σκρατς 2€"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white disabled:bg-slate-50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.price}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { price: Number(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono font-bold text-slate-900 bg-white disabled:bg-slate-50 text-right"
                  />
                </td>
                <td className="py-2 pr-2">
                  {/* Pieces per bundle - 5 for a πεντάδα. The bundle's price
                      follows from the piece price, so a πεντάδα of a €2 game
                      is €10 without anyone entering that separately. */}
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={row.bundleSize ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      update(index, { bundleSize: Number.isFinite(n) && n > 1 ? n : undefined });
                    }}
                    placeholder="—"
                    title="Τεμάχια ανά πακέτο (π.χ. 5 για πεντάδα). Κενό για μεμονωμένα."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-slate-700 bg-white disabled:bg-slate-50 text-right"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={row.backSideEnabled !== false}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { backSideEnabled: e.target.checked })}
                    aria-label={`Πώληση από το πίσω μέρος για ${row.name || 'το παιχνίδι'}`}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-default"
                  />
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => removeGame(index)}
                    disabled={!canEdit}
                    aria-label={`Διαγραφή του ${row.name || 'παιχνιδιού'}`}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-6">
          Κανένα παιχνίδι. Προσθέστε ένα ή επαναφέρετε τις προεπιλογές.
        </p>
      )}
    </div>
  );
};
