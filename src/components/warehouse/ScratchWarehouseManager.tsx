import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Boxes, Check, PackagePlus, RotateCcw, Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import {
  fetchWarehouseGames, fetchWarehousePacks, movePackToStore, receivePack, withdrawPack,
  type WarehouseGame, type WarehousePack,
} from '../../services/scratchWarehouseService.ts';
import {
  digitsOnly, GAME_NO_LENGTH, isValidPackCode, PACK_CODE_LENGTH, readBarcode,
} from '../../lib/scratchBarcode.ts';
import { agingLabel, agingTone, daysInWarehouse, summariseAging } from '../../lib/warehouseAging.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { ConfirmDestructiveModal } from '../ui/ConfirmDestructiveModal.tsx';

/**
 * Η αποθήκη: τα σκρατς που είναι προς πώληση αλλά δεν είναι στο μαγαζί.
 *
 * Ξεχωριστή ανά κατάστημα, οπότε η οθόνη απαιτεί επιλεγμένο κατάστημα αντί
 * να δείχνει ένα άθροισμα που δεν αντιστοιχεί σε κανένα ράφι.
 */

type SortKey = 'received_at' | 'game_no';

const TONE_ROW: Record<string, string> = {
  OK: '',
  WARNING: 'bg-amber-50/60',
  CRITICAL: 'bg-rose-50/70',
};

export const ScratchWarehouseManager: React.FC = () => {
  const { organization, user } = useAuth();
  const { activeStoreId, stores, currentStore } = useTenant();
  const orgId = organization?.id ?? '';
  const storeId = activeStoreId !== 'ALL' ? activeStoreId : '';

  const [games, setGames] = useState<WarehouseGame[]>([]);
  const [packs, setPacks] = useState<WarehousePack[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Καταχώρηση: πρώτα ο 4ψήφιος, μετά ο 7ψήφιος - αλλά ο σαρωτής δίνει και
  // τα 14 μαζί στο πρώτο πεδίο, οπότε αυτό τα σπάει μόνο του.
  const [gameNo, setGameNo] = useState('');
  const [packCode, setPackCode] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('received_at');
  const [search, setSearch] = useState('');
  const [toWithdraw, setToWithdraw] = useState<WarehousePack | null>(null);

  const load = async () => {
    if (!orgId || !storeId) return;
    setLoading(true);
    setProblem(null);
    try {
      const [g, p] = await Promise.all([
        fetchWarehouseGames(orgId, storeId),
        fetchWarehousePacks(orgId, storeId),
      ]);
      setGames(g);
      setPacks(p);
    } catch (err: any) {
      setProblem(err?.message ?? 'Δεν ήταν δυνατή η φόρτωση της αποθήκης.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId]);

  const game = useMemo(
    () => games.find((g) => g.gameNo === gameNo.padStart(GAME_NO_LENGTH, '0')) ?? null,
    [games, gameNo]
  );

  const totals = useMemo(() => {
    const value = packs.reduce((t, p) => t + (Number(p.pieces) || 0) * (Number(p.unit_price) || 0), 0);
    return { value: Math.round(value * 100) / 100, count: packs.length };
  }, [packs]);

  const aging = useMemo(() => summariseAging(packs), [packs]);

  const visible = useMemo(() => {
    const needle = digitsOnly(search) || search.trim().toLowerCase();
    const rows = search.trim()
      ? packs.filter(
          (p) =>
            p.pack_code.includes(needle) ||
            p.game_no.includes(needle) ||
            p.game_name.toLowerCase().includes(search.trim().toLowerCase())
        )
      : packs;
    return [...rows].sort((a, b) =>
      sortKey === 'game_no'
        ? a.game_no.localeCompare(b.game_no) || a.pack_code.localeCompare(b.pack_code)
        : a.received_at.localeCompare(b.received_at)
    );
  }, [packs, search, sortKey]);

  /** Ο σαρωτής δίνει 14 ψηφία στο πρώτο πεδίο. Σπάσ' τα. */
  const onGameNoInput = (raw: string) => {
    const digits = digitsOnly(raw);
    if (digits.length > GAME_NO_LENGTH) {
      const reading = readBarcode(digits);
      if (reading.parts) {
        setGameNo(reading.parts.gameNo);
        setPackCode(reading.parts.packCode);
        return;
      }
    }
    setGameNo(digits.slice(0, GAME_NO_LENGTH));
  };

  const canSave = !!game && isValidPackCode(packCode) && !!receivedAt && !saving;

  const save = async () => {
    if (!game) return;
    setSaving(true);
    setProblem(null);
    setDone(null);
    try {
      await receivePack({
        orgId, storeId, game, packCode: digitsOnly(packCode), receivedAt, userId: user?.id,
      });
      setDone(`${game.name} · πακέτο ${packCode} — ${formatCurrency(game.value)}`);
      setPackCode('');
      await load();
    } catch (err: any) {
      setProblem(err?.message ?? 'Η καταχώρηση απέτυχε.');
    } finally {
      setSaving(false);
    }
  };

  const toStore = async (pack: WarehousePack) => {
    try {
      await movePackToStore(pack.id);
      await load();
    } catch (err: any) {
      setProblem(err?.message ?? 'Η μεταφορά απέτυχε.');
    }
  };

  if (!storeId) {
    return (
      <div className="p-8 text-center">
        <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-sm font-black text-slate-900">Διάλεξε κατάστημα</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Κάθε κατάστημα έχει τη δική του αποθήκη. Ένα άθροισμα όλων δεν θα αντιστοιχούσε σε
          κανένα ράφι.
        </p>
        {stores.length > 0 && (
          <p className="text-micro text-slate-400 mt-3">
            {stores.length === 1 ? 'Διαθέσιμο: ' : 'Διαθέσιμα: '}
            {stores.map((s) => s.name).join(' · ')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-indigo-600" />
            Αποθήκη Σκρατς
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Προς πώληση, αλλά όχι ακόμα στο μαγαζί — {currentStore?.name ?? storeId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-4 py-2 rounded-xl bg-slate-900 text-white">
            <p className="text-micro font-bold text-slate-400">{toGreekUpper('Αξια αποθηκης')}</p>
            <p className="text-base font-black font-mono">{formatCurrency(totals.value)}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200">
            <p className="text-micro font-bold text-slate-500">{toGreekUpper('Πακετα')}</p>
            <p className="text-base font-black font-mono text-slate-900">{totals.count}</p>
          </div>
        </div>
      </div>

      {(aging.warning > 0 || aging.critical > 0) && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 ${
            aging.critical > 0
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs font-bold">
            {aging.critical > 0 && (
              <p>
                {aging.critical} {aging.critical === 1 ? 'πακέτο έληξε' : 'πακέτα έληξαν'} —{' '}
                {formatCurrency(aging.criticalValue)} στο ράφι. Αποσύρετέ τα.
              </p>
            )}
            {aging.warning > 0 && (
              <p className={aging.critical > 0 ? 'mt-0.5 font-semibold' : ''}>
                {aging.warning} {aging.warning === 1 ? 'πακέτο πλησιάζει' : 'πακέτα πλησιάζουν'} τις
                90 ημέρες.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Παραλαβή */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
          <PackagePlus className="w-4 h-4 text-emerald-600" />
          Καταχώρηση παραλαβής
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="wh-game" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
              Αριθμός παιχνιδιού
            </label>
            <input
              id="wh-game"
              inputMode="numeric"
              autoFocus
              value={gameNo}
              onChange={(e) => onGameNoInput(e.target.value)}
              placeholder="0157"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black font-mono tracking-widest text-center focus:border-indigo-400"
            />
            <p className="text-micro text-slate-500 mt-1 min-h-[1rem]">
              {game ? (
                <span className="text-emerald-700 font-bold">
                  {game.name} · {formatCurrency(game.price)} · {game.pieces} δελτία
                </span>
              ) : gameNo.length === GAME_NO_LENGTH ? (
                <span className="text-rose-600 font-bold">Άγνωστος αριθμός παιχνιδιού.</span>
              ) : (
                'Σκανάρετε ή γράψτε — ο σαρωτής συμπληρώνει και τα δύο.'
              )}
            </p>
          </div>

          <div>
            <label htmlFor="wh-pack" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
              Κωδικός πακέτου
            </label>
            <input
              id="wh-pack"
              inputMode="numeric"
              value={packCode}
              onChange={(e) => setPackCode(digitsOnly(e.target.value).slice(0, PACK_CODE_LENGTH))}
              placeholder="3301482"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black font-mono tracking-widest text-center focus:border-indigo-400"
            />
            <p className="text-micro text-slate-500 mt-1 min-h-[1rem]">
              {packCode === '' || isValidPackCode(packCode)
                ? `${PACK_CODE_LENGTH} ψηφία`
                : `Χρειάζονται ${PACK_CODE_LENGTH} — έχετε ${packCode.length}.`}
            </p>
          </div>

          <div>
            <label htmlFor="wh-date" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
              Ημερομηνία παραλαβής
            </label>
            <input
              id="wh-date"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold focus:border-indigo-400"
            />
            <p className="text-micro text-slate-500 mt-1">Από εδώ μετράνε οι 90 ημέρες.</p>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Καταχώρηση…' : `Καταχώρηση${game ? ` · ${formatCurrency(game.value)}` : ''}`}
            </button>
          </div>
        </div>

        {done && (
          <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Καταχωρήθηκε: {done}
          </p>
        )}
        {problem && (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {problem}
          </p>
        )}
      </div>

      {/* Λίστα */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση με κωδικό ή παιχνίδι…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {([['received_at', 'Παλαιότερα πρώτα'], ['game_no', 'Ανά κωδικό']] as Array<[SortKey, string]>).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={`px-3 py-2 text-micro font-bold cursor-pointer ${
                    sortKey === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-center text-xs text-slate-500">Φόρτωση…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">
            {packs.length === 0 ? 'Η αποθήκη είναι άδεια.' : 'Κανένα πακέτο δεν ταιριάζει.'}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Παιχνιδι')}</th>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Κωδικος')}</th>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Παρελαβη')}</th>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Στην αποθηκη')}</th>
                <th className="text-right p-2.5 font-black">{toGreekUpper('Αξια')}</th>
                <th className="text-right p-2.5 font-black">{toGreekUpper('Ενεργειες')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((pack) => {
                const days = daysInWarehouse(pack.received_at);
                const tone = agingTone(days);
                const label = agingLabel(days);
                return (
                  <tr key={pack.id} className={TONE_ROW[tone]}>
                    <td className="p-2.5">
                      <span className="font-bold text-slate-900">{pack.game_name}</span>
                      <span className="block text-micro text-slate-500">
                        {formatCurrency(pack.unit_price)} · {pack.pieces} δελτία
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-slate-700">
                      {pack.game_no} · {pack.pack_code}
                    </td>
                    <td className="p-2.5 font-mono text-slate-700">
                      {new Date(`${pack.received_at}T00:00:00`).toLocaleDateString('el-GR')}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`font-bold ${
                          tone === 'CRITICAL' ? 'text-rose-700' : tone === 'WARNING' ? 'text-amber-700' : 'text-slate-600'
                        }`}
                      >
                        {label ?? `${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-slate-900">
                      {formatCurrency(pack.pieces * pack.unit_price)}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => toStore(pack)}
                          title="Μεταφορά στο μαγαζί"
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-micro cursor-pointer flex items-center gap-1"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Στο μαγαζί
                        </button>
                        <button
                          type="button"
                          onClick={() => setToWithdraw(pack)}
                          title="Απόσυρση στον ΟΠΑΠ"
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-micro cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Απόσυρση
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDestructiveModal
        isOpen={toWithdraw !== null}
        onClose={() => setToWithdraw(null)}
        confirmLabel="Απόσυρση"
        what={
          toWithdraw ? (
            <span className="font-bold">
              το πακέτο {toWithdraw.pack_code} — {toWithdraw.game_name},{' '}
              {formatCurrency(toWithdraw.pieces * toWithdraw.unit_price)}
            </span>
          ) : null
        }
        lines={[
          {
            label: 'Αξία αποθήκης',
            detail: toWithdraw
              ? `μειώνεται κατά ${formatCurrency(toWithdraw.pieces * toWithdraw.unit_price)}`
              : '',
            fate: 'GOES',
          },
          {
            label: 'Ιστορικό',
            detail: 'το πακέτο μένει καταγεγραμμένο ως αποσυρμένο, δεν σβήνεται',
            fate: 'STAYS',
          },
        ]}
        onConfirm={async () => {
          if (!toWithdraw) return;
          await withdrawPack(toWithdraw.id, 'Επιστροφή στον ΟΠΑΠ');
          await load();
        }}
      />
    </div>
  );
};
