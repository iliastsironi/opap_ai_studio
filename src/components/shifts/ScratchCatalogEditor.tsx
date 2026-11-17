import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_SCRATCH_PRESETS,
  isLotteryRow,
  type ScratchTicketRow,
} from './ScratchCalculatorTable.tsx';
import {
  addNewGamesToOtherStores,
  fetchScratchCatalogForEditing,
  saveScratchCatalog,
} from '../../services/scratchCatalogService.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { packPieces } from '../../lib/scratchBarcode.ts';
import { NumericField } from '../ui/NumericField.tsx';
import {
  addToGroup,
  categoryFor,
  groupRows,
  isGrouped,
  isWellPlaced,
  moveToGroupEnd,
  offeredPrices,
  priceLabel,
  runsOf,
  type CatalogRun,
} from '../../lib/scratchCatalogOrder.ts';

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
  // False while the catalogue exists only in this browser, which is what the
  // tills are counting with until somebody saves it here.
  const [fromDatabase, setFromDatabase] = useState(true);
  // Η προσθήκη ρωτάει ΠΡΩΤΑ την τιμή: από αυτήν κρίνεται η ομάδα και η κατηγορία,
  // οπότε η νέα γραμμή πηγαίνει κατευθείαν στη θέση της και όχι στο τέλος της λίστας.
  const [adding, setAdding] = useState(false);
  const [customPrice, setCustomPrice] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Αληθές όταν ο κατάλογος που φορτώθηκε είχε σκρατς εκτός της ομάδας της τιμής τους
  // (π.χ. ένα 5 € που μπήκε από το ταμείο μετά τα λαχεία) και η οθόνη το ομαδοποίησε.
  // Δεν έχει αποθηκευτεί: το ταμείο μετράει με την παλιά σειρά μέχρι το «Αποθήκευση».
  const [regroupedOnLoad, setRegroupedOnLoad] = useState(false);

  // Οι ομάδες όπως εμφανίζονται: συνεχόμενα τμήματα της ίδιας τιμής (ή «λαχεία»).
  const runs: CatalogRun[] = runsOf(rows);
  const runByIndex: number[] = [];
  runs.forEach((run, n) => {
    for (let i = run.start; i <= run.end; i++) runByIndex[i] = n;
  });

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`catalog-name-${focusId}`) as HTMLInputElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus();
    }
    setFocusId(null);
  }, [focusId, rows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScratchCatalogForEditing(orgId, storeId ?? undefined)
      .then(({ rows: catalog, fromDatabase: stored }) => {
        if (cancelled) return;
        // Τα σκρατς μπαίνουν στην ομάδα της τιμής τους μόλις ανοίξει η οθόνη: ένα 5 €
        // που κάθεται μετά τα λαχεία πάει με τα 5 €. Μόνο στην οθόνη - η σειρά που
        // μετράει το ταμείο αλλάζει όταν πατηθεί «Αποθήκευση καταλόγου».
        const grouped = isGrouped(catalog) ? catalog : groupRows(catalog);
        setRows(grouped);
        setRegroupedOnLoad(grouped !== catalog);
        setFromDatabase(stored);
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
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        // Η κατηγορία δεν γράφεται με το χέρι: βγαίνει από την τιμή και το είδος,
        // ώστε «Σκρατς 5€» να σημαίνει πάντα σκρατς των 5 €.
        if ('price' in patch || 'kind' in patch) next.category = categoryFor(next);
        return next;
      })
    );
  };

  /** Αλλαγή είδους: η γραμμή αλλάζει ομάδα, άρα πάει αμέσως στο τέλος της νέας. */
  const changeKind = (index: number, kind: 'SCRATCH' | 'LOTTERY') => {
    const id = rows[index]?.id;
    update(index, { kind });
    if (id) setRows((prev) => moveToGroupEnd(prev, id));
  };

  /**
   * Όταν τελειώσει η πληκτρολόγηση της τιμής (όχι σε κάθε ψηφίο: το «10» περνάει
   * από το «1»): αν η γραμμή βγήκε από την ομάδα της, πηγαίνει στο τέλος της νέας.
   * Αν δεν βγήκε, δεν κουνιέται - ένα απλό κλικ στο κουτάκι δεν αλλάζει σειρά.
   */
  const regroupAfterPrice = (id: string) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return prev;
      // Άδειο ή μηδέν κουτάκι = ο χρήστης δεν έχει γράψει ακόμα την τιμή: δεν μετακινείται.
      if (!isLotteryRow(prev[i]) && !(Number(prev[i].price) > 0)) return prev;
      return isWellPlaced(prev, i) ? prev : moveToGroupEnd(prev, id);
    });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    // Μόνο μέσα στην ομάδα: αλλιώς ένα βελάκι θα έβαζε ένα σκρατς των 5 €
    // ανάμεσα στα 2 € και θα έσπαγε την ομαδοποίηση.
    if (runByIndex[index] !== runByIndex[target]) return;
    setMessage(null);
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addGame = (kind: 'SCRATCH' | 'LOTTERY', price: number) => {
    if (kind === 'SCRATCH' && !(price > 0)) {
      setError('Γράψτε πρώτα την τιμή του σκρατς.');
      return;
    }
    setMessage(null);
    setError(null);
    // Stable and unique: the catalogue is keyed on this, and a game added
    // on two devices at once must not collide on one id.
    const row: ScratchTicketRow = {
      id: `scr_custom_${Date.now().toString(36)}`,
      name: '',
      category: '',
      kind,
      price: kind === 'LOTTERY' ? price || 2 : price,
      startNo: '',
      endNo: '',
      // Κάθε σκρατς μετράει μπρος και πίσω· τα λαχεία δεν έχουν πίσω.
      ...(kind === 'SCRATCH' ? { backSideEnabled: true } : {}),
    };
    row.category = categoryFor(row);
    // Στο τέλος της ομάδας της τιμής του, όχι στο τέλος της λίστας.
    setRows((prev) => addToGroup(prev, row));
    setAdding(false);
    setCustomPrice(0);
    setFocusId(row.id);
  };

  /** Σε κατάλογο που έχει μετακινηθεί με το χέρι: οι ομάδες ξανά μαζί, μια φορά, όταν το ζητήσει ο χρήστης. */
  const regroupAll = () => {
    setMessage(null);
    setRows((prev) => groupRows(prev));
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
      // Ό,τι δεν ρυθμίζεται πια από εδώ γράφεται ως κανόνας: κάθε σκρατς έχει
      // μπρος ΚΑΙ πίσω (το «μόνο μπροστά» είναι ρύθμιση του καταστήματος, στη
      // Λειτουργία πώλησης σκρατς), και κανένα σκρατς δεν μετριέται σε πεντάδες -
      // ένα σκρατς με «πακέτο» μετριέται σαν λαχείο, και αυτό έκανε το «Δώρο 5€»
      // να εμφανίζεται ως λαχείο. Τα λαχεία κρατούν ό,τι έχουν.
      const toSave = rows.map((r) =>
        isLotteryRow(r) ? r : { ...r, bundleSize: undefined, backSideEnabled: true }
      );
      await saveScratchCatalog(orgId, storeId, toSave);
      setRows(toSave);
      setRegroupedOnLoad(false);

      // Ο 4ψήφιος είναι του ΟΠΑΠ, όχι του μαγαζιού: ένα παιχνίδι που μπήκε
      // εδώ λείπει από τα υπόλοιπα καταστήματα μέχρι να ξαναγραφεί με το
      // χέρι, και τα χριστουγεννιάτικα το έδειξαν. Μόνο προσθήκες - δες
      // lib/catalogPropagation.ts για το γιατί κρίνει ο 4ψήφιος και όχι ο
      // εσωτερικός κωδικός.
      //
      // Η αποθήκευση έχει ήδη πετύχει εδώ. Αν η αντιγραφή σκοντάψει, το
      // λέει χωριστά αντί να διαβαστεί σαν αποτυχία της αποθήκευσης.
      let spread = '';
      if (storeId) {
        try {
          const report = await addNewGamesToOtherStores(orgId, storeId, toSave);
          const added = report.filter((r) => r.added.length > 0);
          if (added.length > 0) {
            spread =
              ' Προστέθηκε και σε: ' +
              added.map((r) => `${r.storeName} (${r.added.join(', ')})`).join(' · ') +
              '.';
          }
        } catch (err: any) {
          spread = ` Ο κατάλογος σώθηκε, αλλά η αντιγραφή στα άλλα καταστήματα απέτυχε: ${
            err?.message ?? 'άγνωστο σφάλμα'
          }`;
        }
      }
      setMessage(`Ο κατάλογος αποθηκεύτηκε. Ισχύει αμέσως σε κάθε συσκευή.${spread}`);
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
  const hiddenCount = rows.filter((r) => r.hidden).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm">Κατάλογος Σκρατς & Λαχείων</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length} παιχνίδια — {scratchCount} σκρατς, {rows.length - scratchCount} λαχεία
            {hiddenCount > 0 && `, ${hiddenCount} ${hiddenCount === 1 ? 'κρυφό' : 'κρυφά'}`}.
            Η σειρά εδώ είναι η σειρά που μετράει το ταμείο. Τα κρυφά δεν φαίνονται στο ταμείο.
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
              onClick={() => setAdding((open) => !open)}
              aria-expanded={adding}
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

      {canEdit && adding && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div>
            <p className="text-xs font-black text-slate-800">Τι τιμή έχει το νέο σκρατς;</p>
            <p className="text-micro text-slate-500 mt-0.5">
              Θα μπει στο τέλος της ομάδας της τιμής του, με κατηγορία «Σκρατς …€».
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {offeredPrices(rows).map((price) => (
              <button
                key={price}
                type="button"
                onClick={() => addGame('SCRATCH', price)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-black hover:border-brand hover:bg-indigo-50 transition-colors cursor-pointer"
              >
                {priceLabel(price)} €
              </button>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <NumericField
                min={0}
                decimals={2}
                value={customPrice}
                blankWhenZero
                placeholder="Άλλη τιμή"
                aria-label="Άλλη τιμή για το νέο σκρατς"
                onChange={setCustomPrice}
                className="w-24 px-2.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 bg-white text-right text-xs"
              />
              <button
                type="button"
                onClick={() => addGame('SCRATCH', customPrice)}
                disabled={!(customPrice > 0)}
                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Προσθήκη
              </button>
            </span>
          </div>
          <button
            type="button"
            onClick={() => addGame('LOTTERY', 2)}
            className="text-micro font-bold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer"
          >
            Είναι λαχείο, όχι σκρατς
          </button>
        </div>
      )}

      {canEdit && regroupedOnLoad && (
        <div className="text-xs text-slate-800 bg-indigo-50 border border-brand rounded-xl p-3 space-y-0.5">
          <span className="font-black block">Τα σκρατς μπήκαν στις ομάδες της τιμής τους</span>
          <span className="block">
            Κάποιο σκρατς ήταν εκτός της ομάδας του (π.χ. ένα 5 € μετά τα λαχεία) και πήγε με τα
            υπόλοιπα της τιμής του. Στο ταμείο θα ισχύσει όταν πατήσετε{' '}
            <strong>Αποθήκευση καταλόγου</strong>.
          </span>
        </div>
      )}

      {canEdit && !isGrouped(rows) && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <span>
            Τα σκρατς δεν είναι ομαδοποιημένα ανά τιμή. Η σειρά εδώ είναι η σειρά που μετράει το ταμείο,
            γι' αυτό δεν άλλαξε μόνη της.
          </span>
          <button
            type="button"
            onClick={regroupAll}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold cursor-pointer"
          >
            Ομαδοποίηση ανά τιμή
          </button>
        </div>
      )}

      {!fromDatabase && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-1">
          <span className="font-black block">Ο κατάλογος δεν έχει αποθηκευτεί ακόμα</span>
          <span className="block">
            Αυτά είναι όσα μετράει <strong>αυτός ο browser</strong> — κάθε μηχάνημα μπορεί να
            έχει διαφορετική λίστα και διαφορετικές τιμές. Πατήστε <strong>Αποθήκευση</strong>{' '}
            μία φορά και θα ισχύει για όλους.
          </span>
        </div>
      )}

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
              <th className="py-2 pr-2 w-24" title="Τα πρώτα 4 ψηφία του barcode">Αρ. παιχν.</th>
              <th
                className="py-2 pr-2 w-24"
                title="Δελτία ανά πακέτο: υπολογίζονται μόνα τους από την τιμή (300 € / τιμή)"
              >
                Δελτία
              </th>
              <th
                className="py-2 pr-2 w-16 text-center"
                title="Κρυφό: το παιχνίδι δεν φαίνεται στο ταμείο, αλλά μένει στον κατάλογο"
              >
                Ορατό
              </th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const run = runs[runByIndex[index]];
              const firstOfRun = run.start === index;
              return (
              <React.Fragment key={row.id}>
              {firstOfRun && (
                <tr>
                  <td colSpan={9} className="pt-4 pb-1.5">
                    <span className="inline-flex items-baseline gap-2">
                      <span className="text-micro font-black uppercase tracking-wider text-slate-800">{run.title}</span>
                      <span className="text-micro text-slate-400">
                        {run.end - run.start + 1} {run.end === run.start ? 'παιχνίδι' : 'παιχνίδια'}
                        {(() => {
                          const hiddenHere = rows.slice(run.start, run.end + 1).filter((r) => r.hidden).length;
                          return hiddenHere > 0 ? ` · ${hiddenHere} ${hiddenHere === 1 ? 'κρυφό' : 'κρυφά'}` : '';
                        })()}
                      </span>
                    </span>
                  </td>
                </tr>
              )}
              <tr className={`border-b border-slate-100 last:border-0 ${row.hidden ? 'bg-slate-50' : ''}`}>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={!canEdit || index === run.start}
                      aria-label={`Μετακίνηση του ${row.name || 'παιχνιδιού'} πιο πάνω`}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={!canEdit || index === run.end}
                      aria-label={`Μετακίνηση του ${row.name || 'παιχνιδιού'} πιο κάτω`}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <input
                    id={`catalog-name-${row.id}`}
                    value={row.name}
                    maxLength={MAX_LABEL_LENGTH}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder="Όνομα παιχνιδιού"
                    className={`w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold bg-white disabled:bg-slate-50 ${
                      row.hidden ? 'text-slate-400' : 'text-slate-900'
                    }`}
                  />
                  {row.hidden && (
                    <span className="block mt-1 text-micro font-bold text-slate-500">Κρυφό στο ταμείο</span>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={row.kind ?? (isLotteryRow(row) ? 'LOTTERY' : 'SCRATCH')}
                    disabled={!canEdit}
                    onChange={(e) => changeKind(index, e.target.value as 'SCRATCH' | 'LOTTERY')}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 bg-white disabled:bg-slate-50 cursor-pointer"
                  >
                    <option value="SCRATCH">Σκρατς</option>
                    <option value="LOTTERY">Λαχείο</option>
                  </select>
                </td>
                <td className="py-2 pr-2">
                  {/* Δεν γράφεται: βγαίνει από την τιμή και το είδος, ώστε οι ομάδες
                      και τα «Σκρατς 5€» του ταμείου να λένε πάντα ό,τι ισχύει. */}
                  <span
                    title="Η κατηγορία ακολουθεί την τιμή. Αλλάξτε την τιμή για να αλλάξει."
                    className="inline-block w-full px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold whitespace-nowrap"
                  >
                    {row.category || categoryFor(row)}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  <NumericField
                    min={0}
                    decimals={2}
                    value={row.price}
                    disabled={!canEdit}
                    aria-label={`Τιμή για ${row.name || "το παιχνίδι"}`}
                    onChange={(next) => update(index, { price: next })}
                    onBlur={() => regroupAfterPrice(row.id)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono font-bold text-slate-900 bg-white disabled:bg-slate-50 text-right"
                  />
                </td>
                {/* Ο αριθμός παιχνιδιού: ό,τι σκανάρεται πρώτο στην αποθήκη.
                    Κενό σημαίνει «δεν μπαίνει στην αποθήκη», που είναι σωστό
                    για ένα παιχνίδι χωρίς πανελλαδικό αριθμό. */}
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={row.gameNo ?? ''}
                    disabled={!canEdit}
                    placeholder="—"
                    title="Τα πρώτα 4 ψηφία του barcode. Κενό = δεν μπαίνει στην αποθήκη."
                    aria-label={`Αριθμός παιχνιδιού για ${row.name || 'το παιχνίδι'}`}
                    onChange={(e) =>
                      update(index, {
                        gameNo: e.target.value.replace(/\D/g, '').slice(0, 4) || undefined,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-slate-700 bg-white disabled:bg-slate-50 text-center tracking-widest"
                  />
                </td>
                {/* Δελτία ανά πακέτο: βγαίνουν ΜΟΝΑ τους από την τιμή (300 € / τιμή),
                    δεν γράφονται. Αν ο αριθμός είναι άλλος - το 7ΑΡΙ Χ50 έχει 15 - γράφεται
                    πάνω στον αυτόματο, και μένει εκεί μέχρι να ξαναγραφτεί ο ίδιος. */}
                <td className="py-2 pr-2">
                  {isLotteryRow(row) ? (
                    <span className="text-micro text-slate-400" title="Τα λαχεία δεν έχουν πακέτο με δελτία.">
                      —
                    </span>
                  ) : (
                    (() => {
                      const auto = packPieces(row.price);
                      const shown = packPieces(row.price, row.packPieces);
                      const overridden = !!row.packPieces && row.packPieces !== auto;
                      return (
                        <NumericField
                          min={0}
                          decimals={0}
                          value={shown ?? 0}
                          blankWhenZero
                          disabled={!canEdit}
                          placeholder="—"
                          title={
                            overridden
                              ? `Ορίστηκε με το χέρι. Αυτόματα θα ήταν ${auto ?? '—'}. Γράψτε ξανά ${auto ?? 'τον αριθμό'} για να γυρίσει στον αυτόματο.`
                              : auto
                              ? `Αυτόματα: 300 € / ${row.price} € = ${auto} δελτία ανά πακέτο.`
                              : 'Η τιμή δεν διαιρεί τα 300 €: γράψτε πόσα δελτία έχει το πακέτο.'
                          }
                          aria-label={`Δελτία ανά πακέτο για ${row.name || 'το παιχνίδι'}`}
                          // Ό,τι ισούται με τον αυτόματο δεν αποθηκεύεται ως «εξαίρεση».
                          onChange={(next) =>
                            update(index, {
                              packPieces: next > 0 && next !== auto ? next : undefined,
                            })
                          }
                          className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-right disabled:bg-slate-50 ${
                            overridden
                              ? 'border-amber-300 bg-amber-50 font-bold text-slate-900'
                              : 'border-slate-200 bg-slate-50 text-slate-500'
                          }`}
                        />
                      );
                    })()
                  )}
                </td>
                {/* Κρυφό / ορατό. Δεν διαγράφει τίποτα: το παιχνίδι μένει στη θέση του
                    και ξαναεμφανίζεται με ένα κλικ. Για τα σκρατς που δεν λειτουργεί
                    το μαγαζί αυτή την περίοδο. */}
                <td className="py-2 pr-2 text-center">
                  {isLotteryRow(row) ? (
                    <span
                      className="text-micro text-slate-400"
                      title="Τα εποχικά λαχεία έχουν δικό τους διακόπτη στις ρυθμίσεις."
                    >
                      —
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => update(index, { hidden: row.hidden ? undefined : true })}
                      disabled={!canEdit}
                      aria-pressed={!!row.hidden}
                      aria-label={
                        row.hidden
                          ? `Εμφάνιση του ${row.name || 'παιχνιδιού'} στο ταμείο`
                          : `Απόκρυψη του ${row.name || 'παιχνιδιού'} από το ταμείο`
                      }
                      title={
                        row.hidden
                          ? 'Κρυφό: δεν φαίνεται στο ταμείο. Πατήστε για να εμφανιστεί.'
                          : 'Ορατό στο ταμείο. Πατήστε για να κρυφτεί (δεν διαγράφεται).'
                      }
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:cursor-default ${
                        row.hidden
                          ? 'border-slate-300 bg-slate-200 text-slate-500 hover:bg-slate-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {row.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
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
              </React.Fragment>
              );
            })}
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
