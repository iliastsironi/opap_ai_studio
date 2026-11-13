import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ScanLine, X } from 'lucide-react';
import { receivePack, type WarehouseGame } from '../../services/scratchWarehouseService.ts';
import { BARCODE_LENGTH, digitsOnly } from '../../lib/scratchBarcode.ts';
import {
  batchTotal, registerStaged, stageScan, totalsByGame, type ScanOutcome, type StagedPack,
} from '../../lib/scanBatch.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { BarcodeCameraModal, type CameraFeedback } from './BarcodeCameraModal.tsx';

/**
 * Παραλαβή παραγγελίας με σκανάρισμα: πολλά πακέτα, ένας έλεγχος, μία καταχώρηση.
 *
 * Δύο δρόμοι δίνουν το ίδιο κείμενο: σαρωτής USB/Bluetooth (πληκτρολογεί τα
 * ψηφία και συνήθως στέλνει Enter) και κάμερα. Κάθε σκανάρισμα μπαίνει σε
 * λίστα· ΤΙΠΟΤΑ δεν γράφεται μέχρι να πατηθεί η Καταχώρηση, με τα σύνολα ανά
 * παιχνίδι μπροστά στον χρήστη - για να τα βάλει δίπλα στο χαρτί της
 * παραγγελίας.
 *
 * Το πεδίο ΔΕΝ ξαναγράφει την τιμή του σε κάθε πλήκτρο: ο σαρωτής που
 * πληκτρολογεί ψηφίο-ψηφίο θα έχανε ό,τι κόβεται στη μέση. Μαζεύει ό,τι
 * έρχεται και το διαβάζει είτε με Enter είτε όταν σταματήσει η ροή.
 */

interface Props {
  orgId: string;
  storeId: string;
  userId?: string | null;
  games: WarehouseGame[];
  /** Ό,τι υπάρχει ήδη στο κατάστημα, σε όλες τις θέσεις - για τα διπλά. */
  existing: ReadonlyArray<{ catalog_code: string; pack_code: string }>;
  /** Η ημερομηνία παραλαβής της φόρμας από πάνω· από εκεί μετράνε οι 90 ημέρες. */
  receivedAt: string;
  onRegistered: () => Promise<void> | void;
}

/** Ο σαρωτής τελειώνει μέσα σε χιλιοστά· ό,τι σταματά για τόσο, τελείωσε. */
const SCAN_IDLE_MS = 180;

export const ScanReceivePanel: React.FC<Props> = ({
  orgId, storeId, userId, games, existing, receivedAt, onRegistered,
}) => {
  const [staged, setStaged] = useState<StagedPack[]>([]);
  // Καθρέφτης για τα σκαναρίσματα που έρχονται πριν προλάβει να ξαναζωγραφιστεί η οθόνη.
  const stagedRef = useRef<StagedPack[]>([]);
  const [buffer, setBuffer] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<{ ok: string | null; failures: string[] } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const setBoth = (next: StagedPack[]) => {
    stagedRef.current = next;
    setStaged(next);
  };

  const gamesRef = useRef(games);
  gamesRef.current = games;
  const existingRef = useRef(existing);
  existingRef.current = existing;

  /** Ένα σκανάρισμα, από όποιον δρόμο κι αν ήρθε. */
  const consume = useCallback((raw: string): ScanOutcome => {
    const outcome = stageScan(raw, {
      games: gamesRef.current,
      staged: stagedRef.current,
      existing: existingRef.current,
    });
    if (outcome.ok) setBoth([...stagedRef.current, outcome.pack]);
    setNote({ ok: outcome.ok, text: outcome.message });
    setReport(null);
    return outcome;
  }, []);

  const consumeForCamera = useCallback(
    (text: string): CameraFeedback => {
      const outcome = consume(text);
      return { ok: outcome.ok, message: outcome.message };
    },
    [consume]
  );

  // Σαρωτής χωρίς Enter: τα 14 (ή 16) ψηφία έρχονται και η ροή σταματά.
  useEffect(() => {
    if (digitsOnly(buffer).length < BARCODE_LENGTH) return;
    const timer = setTimeout(() => {
      consume(buffer);
      setBuffer('');
    }, SCAN_IDLE_MS);
    return () => clearTimeout(timer);
  }, [buffer, consume]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (buffer.trim() === '') return;
    consume(buffer);
    setBuffer('');
  };

  const remove = (key: string) => setBoth(stagedRef.current.filter((s) => s.key !== key));

  const total = batchTotal(staged);
  const perGame = totalsByGame(staged);

  const register = async () => {
    if (staged.length === 0 || saving) return;
    setSaving(true);
    setReport(null);
    try {
      const { registered, failed } = await registerStaged(staged, (pack) =>
        receivePack({
          orgId,
          storeId,
          game: pack.game as WarehouseGame,
          packCode: pack.packCode,
          receivedAt,
          userId,
        })
      );
      // Ό,τι απέτυχε μένει στη λίστα: δεν εξαφανίζεται ούτε φαίνεται καταχωρημένο.
      setBoth(failed.map((f) => f.pack));
      const done = batchTotal(registered);
      setReport({
        ok:
          registered.length > 0
            ? `Καταχωρήθηκαν ${done.count} ${done.count === 1 ? 'πακέτο' : 'πακέτα'} · ${formatCurrency(done.value)}.`
            : null,
        failures: failed.map((f) => `${f.pack.game.name} · ${f.pack.packCode}: ${f.message}`),
      });
      setNote(null);
      await onRegistered();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-indigo-600" />
            Παραλαβή παραγγελίας με σκανάρισμα
          </h2>
          <p className="text-micro text-slate-500 mt-0.5">
            Σκανάρετε το μακρόστενο barcode κάθε πακέτου (από οποιοδήποτε εισιτήριό του). Τίποτα δεν
            γράφεται μέχρι να πατήσετε Καταχώρηση.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="shrink-0 px-3 py-2 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
        >
          <Camera className="w-3.5 h-3.5" />
          Κάμερα
        </button>
      </div>

      <div>
        <label htmlFor="wh-scan" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
          Σαρωτής
        </label>
        <input
          id="wh-scan"
          // Το Enter του σαρωτή σημαίνει «τέλος σαρώσεως», όχι «επόμενο
          // πεδίο» - βλ. lib/enterAdvancesFocus.ts.
          data-enter-advance="off"
          inputMode="numeric"
          autoComplete="off"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Κάντε κλικ εδώ και σκανάρετε…"
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black font-mono tracking-widest text-center focus:border-indigo-400"
        />
        <p
          role="status"
          className={`text-micro mt-1 min-h-[1rem] font-bold ${
            note ? (note.ok ? 'text-emerald-700' : 'text-amber-700') : 'text-slate-500'
          }`}
        >
          {note ? `${note.ok ? '✓ ' : ''}${note.text}` : 'Ο σαρωτής πληκτρολογεί μόνος του· δεν χρειάζεται να πατήσετε τίποτα.'}
        </p>
      </div>

      {staged.length > 0 && (
        <div className="space-y-2">
          {/* Τα σύνολα ανά παιχνίδι - αυτά που γράφει και το χαρτί της παραγγελίας. */}
          <div className="flex flex-wrap gap-1.5">
            {perGame.map((g) => (
              <span
                key={g.gameNo}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 text-micro font-black"
              >
                {g.name} × {g.count} = {formatCurrency(g.value)}
              </span>
            ))}
          </div>

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
            {staged.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-bold text-slate-800">{s.game.name}</span>{' '}
                  <span className="font-mono tracking-wider text-slate-600">{s.packCode}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-slate-700 tabular-nums">{formatCurrency(s.game.value)}</span>
                  <button
                    type="button"
                    onClick={() => remove(s.key)}
                    aria-label={`Αφαίρεση του πακέτου ${s.packCode}`}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-slate-900">
              {total.count} {total.count === 1 ? 'πακέτο' : 'πακέτα'} · {formatCurrency(total.value)}
              <span className="ml-2 font-bold text-slate-500">
                παραλαβή {new Date(receivedAt).toLocaleDateString('el-GR')}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoth([])}
                disabled={saving}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Καθαρισμός
              </button>
              <button
                type="button"
                onClick={register}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Καταχώρηση…' : `Καταχώρηση ${total.count} ${total.count === 1 ? 'πακέτου' : 'πακέτων'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {report?.ok && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {report.ok}
        </p>
      )}
      {report && report.failures.length > 0 && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 space-y-0.5">
          <p>Δεν καταχωρήθηκαν (έμειναν στη λίστα):</p>
          {report.failures.map((f) => (
            <p key={f} className="font-normal">{f}</p>
          ))}
        </div>
      )}

      {cameraOpen && (
        <BarcodeCameraModal onClose={() => setCameraOpen(false)} onDetected={consumeForCamera} />
      )}
    </div>
  );
};
