import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Boxes, Check, PackagePlus, Pencil, RotateCcw, Search, Trash2, Truck, Undo2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import {
  cancelDelivery, correctPack, deletePackById, deliverPackToStore, fetchPackPositions,
  fetchWarehouseGames, fetchWarehousePacks, receivePack, returnPackById, withdrawPack,
  type PackStatus, type WarehouseGame, type WarehousePack,
} from '../../services/scratchWarehouseService.ts';
import {
  digitsOnly, GAME_NO_LENGTH, isValidPackCode, PACK_CODE_LENGTH, readBarcode,
} from '../../lib/scratchBarcode.ts';
import {
  agingLabel, agingTone, canWithdraw, daysInWarehouse, summariseAging, withdrawBlockedReason,
} from '../../lib/warehouseAging.ts';
import { packProgress, progressTone, type ProgressRow } from '../../lib/packProgress.ts';
import { warehouseStartState } from '../../lib/warehouseHandover.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDestructiveModal } from '../ui/ConfirmDestructiveModal.tsx';

/**
 * Η αποθήκη: τα σκρατς που είναι προς πώληση αλλά δεν είναι στο μαγαζί.
 *
 * Ξεχωριστή ανά κατάστημα, οπότε η οθόνη απαιτεί επιλεγμένο κατάστημα αντί
 * να δείχνει ένα άθροισμα που δεν αντιστοιχεί σε κανένα ράφι.
 *
 * Τέσσερις θέσεις, και η σειρά τους είναι η διαδρομή ενός πακέτου:
 *
 *   ΣΤΗΝ ΑΠΟΘΗΚΗ → ΠΡΟΣ ΠΑΡΑΔΟΣΗ → ΣΤΟ ΜΑΓΑΖΙ → ΑΠΟΣΥΡΜΕΝΑ
 *
 * Ο αντμιν πατάει «Παράδοση» για τα πακέτα που κουβαλάει στο μαγαζί· ο
 * υπάλληλος βλέπει στο ταμείο ΜΟΝΟ αυτά, και η παραλαβή είναι το άνοιγμα
 * του πακέτου. Το απούλητο απόθεμα είναι οι δύο πρώτες θέσεις μαζί, γι'
 * αυτό και οι δύο μετρητές πάνω δεξιά - ένα πακέτο που παραδόθηκε δεν
 * πουλήθηκε, και η αξία του δεν επιτρέπεται να φύγει από την οθόνη.
 */

type SortKey = 'received_at' | 'game_no';

const TONE_ROW: Record<string, string> = {
  OK: '',
  WARNING: 'bg-amber-50/60',
  CRITICAL: 'bg-rose-50/70',
};

export const ScratchWarehouseManager: React.FC = () => {
  const { organization, user, roles, permissions } = useAuth();
  const { activeStoreId, stores, currentStore } = useTenant();
  const orgId = organization?.id ?? '';
  const storeId = activeStoreId !== 'ALL' ? activeStoreId : '';

  const [games, setGames] = useState<WarehouseGame[]>([]);
  const [packs, setPacks] = useState<WarehousePack[]>([]);
  /** Πού βρίσκεται κάθε πακέτο που τρέχει, από τις γραμμές των βαρδιών. */
  const [positions, setPositions] = useState<Record<string, ProgressRow>>({});
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
  const [statusFilter, setStatusFilter] = useState<PackStatus>('IN_WAREHOUSE');
  const [search, setSearch] = useState('');
  const [toWithdraw, setToWithdraw] = useState<WarehousePack | null>(null);
  /**
   * Το πακέτο που δεν έπρεπε να γραφτεί ποτέ - χωριστά από το toWithdraw,
   * γιατί είναι άλλη ερώτηση: η απόσυρση λέει «γύρισε στον ΟΠΑΠ», η
   * διαγραφή λέει «δεν υπήρξε». Δες deletePackById.
   */
  const [toDelete, setToDelete] = useState<WarehousePack | null>(null);
  /** Το πακέτο που διορθώνεται, με ό,τι έχει γραφτεί μέχρι στιγμής. */
  const [editing, setEditing] = useState<WarehousePack | null>(null);
  const [editGameNo, setEditGameNo] = useState('');
  const [editPackCode, setEditPackCode] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editProblem, setEditProblem] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  /**
   * Η διόρθωση είναι στενότερη από το υπόλοιπο της οθόνης.
   *
   * Η αποθήκη ανοίγει σε Ιδιοκτήτη, Διαχειριστή και Υπεύθυνο καταστήματος -
   * η παραλαβή είναι καθημερινή δουλειά. Το να ξαναγράψεις ΠΟΙΟ πακέτο
   * είναι αυτό και ΠΟΤΕ ήρθε δεν είναι: η ημερομηνία είναι το ρολόι της
   * λήξης, και ένας πρόχειρος χειρισμός κάνει ένα ληγμένο πακέτο φρέσκο.
   *
   * Η βάση δέχεται και τον υπεύθυνο. Εδώ η οθόνη είναι πιο αυστηρή από τη
   * βάση, που είναι η ακίνδυνη κατεύθυνση - το αντίστροφο δίνει κουμπί που
   * αποτυγχάνει πάντα.
   */
  const canCorrect =
    roles.some((r) => ['ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN'].includes(r.code)) ||
    permissions.includes('*');

  const editGame = useMemo(
    () => games.find((g) => g.gameNo === editGameNo) ?? null,
    [games, editGameNo]
  );

  const openEdit = (pack: WarehousePack) => {
    setEditing(pack);
    setEditGameNo(pack.game_no.trim());
    setEditPackCode(pack.pack_code.trim());
    setEditDate(pack.received_at.slice(0, 10));
    setEditProblem(null);
  };

  const saveEdit = async () => {
    if (!editing || !editGame) return;
    setEditSaving(true);
    setEditProblem(null);
    try {
      await correctPack({
        packId: editing.id,
        game: editGame,
        packCode: digitsOnly(editPackCode),
        receivedAt: editDate,
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      setEditProblem(err?.message ?? 'Η διόρθωση απέτυχε.');
    } finally {
      setEditSaving(false);
    }
  };

  /**
   * Μια πράξη πάνω σε ένα πακέτο: τρέχει, ξαναδιαβάζει, και λέει τι πήγε
   * λάθος αντί να μην κάνει τίποτα.
   *
   * Το packId κρατιέται όσο τρέχει, ώστε το κουμπί της γραμμής να μπορεί
   * να κλειδώσει - δύο κλικ «Παράδοση» στο ίδιο πακέτο είναι το πρώτο
   * πράγμα που κάνει κανείς όταν ο διακομιστής αργήσει ένα δευτερόλεπτο.
   */
  const [busyPackId, setBusyPackId] = useState<string | null>(null);

  const act = async (pack: WarehousePack, what: (id: string) => Promise<void>) => {
    setBusyPackId(pack.id);
    setProblem(null);
    setDone(null);
    try {
      await what(pack.id);
      await load();
    } catch (err: any) {
      setProblem(err?.message ?? 'Η ενέργεια απέτυχε.');
    } finally {
      setBusyPackId(null);
    }
  };

  const load = async () => {
    if (!orgId || !storeId) return;
    setLoading(true);
    setProblem(null);
    try {
      const [g, p, pos] = await Promise.all([
        fetchWarehouseGames(orgId, storeId),
        // Όλες οι καταστάσεις: η αποθήκη πρέπει να λέει και τι έφυγε, όχι
        // μόνο τι απέμεινε. Ένα πακέτο που εξαφανίζεται από την οθόνη τη
        // στιγμή που βγαίνει στον πάγκο δεν αφήνει τίποτα να κοιτάξει
        // κανείς όταν αναρωτηθεί πού πήγε.
        fetchWarehousePacks(orgId, storeId, [
          'IN_WAREHOUSE', 'PENDING_DELIVERY', 'IN_STORE', 'WITHDRAWN',
        ]),
        // Η πρόοδος των πακέτων που τρέχουν. Αποτυχία εδώ δεν κρύβει την
        // αποθήκη: χωρίς θέσεις, η στήλη λέει απλώς «βγήκε στο μαγαζί».
        fetchPackPositions(orgId, storeId).catch(() => ({})),
      ]);
      setGames(g);
      setPacks(p);
      setPositions(pos);
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

  /**
   * Ξαναδιαβάζει όταν η καρτέλα ξαναγίνεται ορατή.
   *
   * Ένα πακέτο φεύγει από την αποθήκη όταν το ανοίξει το ταμείο - σε άλλη
   * οθόνη, συχνά σε άλλη καρτέλα του browser. Χωρίς αυτό, η αποθήκη
   * εξακολουθεί να δείχνει στο ράφι κάτι που μόλις βγήκε στον πάγκο, και η
   * αξία που διαβάζει κανείς είναι η χθεσινή.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId]);

  const game = useMemo(
    () => games.find((g) => g.gameNo === gameNo.padStart(GAME_NO_LENGTH, '0')) ?? null,
    [games, gameNo]
  );

  /** Στο ράφι. Ένα πακέτο στον πάγκο δεν είναι απόθεμα αποθήκης. */
  const shelf = useMemo(() => packs.filter((p) => p.status === 'IN_WAREHOUSE'), [packs]);
  /** Παραδομένα: έφυγαν από το ράφι, δεν άνοιξαν. Απούλητα, αλλά αλλού. */
  const pending = useMemo(() => packs.filter((p) => p.status === 'PENDING_DELIVERY'), [packs]);
  /** Ό,τι δεν έχει ανοίξει - αυτό που μετράει το ρολόι των 90 ημερών. */
  const unopened = useMemo(() => [...shelf, ...pending], [shelf, pending]);

  const counts = useMemo(
    () => ({
      IN_WAREHOUSE: shelf.length,
      PENDING_DELIVERY: pending.length,
      IN_STORE: packs.filter(
        (p) => p.status === 'IN_STORE' && packProgress(positions[p.pack_code], p.pieces).remaining > 0
      ).length,
      WITHDRAWN: packs.filter((p) => p.status === 'WITHDRAWN').length,
    }),
    [packs, shelf, pending, positions]
  );

  const finished = useMemo(
    () =>
      packs.filter(
        (p) =>
          p.status === 'IN_STORE' && packProgress(positions[p.pack_code], p.pieces).remaining === 0
      ).length,
    [packs, positions]
  );

  const valueOf = (list: ReadonlyArray<WarehousePack>) =>
    Math.round(
      list.reduce((t, p) => t + (Number(p.pieces) || 0) * (Number(p.unit_price) || 0), 0) * 100
    ) / 100;

  const totals = useMemo(
    () => ({
      shelfValue: valueOf(shelf),
      shelfCount: shelf.length,
      pendingValue: valueOf(pending),
      pendingCount: pending.length,
    }),
    [shelf, pending]
  );

  // Το ρολόι λήξης αφορά ό,τι δεν έχει ανοίξει, όπου κι αν κάθεται. Ένα
  // πακέτο που πουλήθηκε δεν λήγει - αλλά ένα παραδομένο που κανείς δεν
  // άνοιξε λήγει κανονικά, και πριν το 0076 η ειδοποίηση θα το έχανε τη
  // στιγμή που ο αντμιν το κουβαλούσε στο μαγαζί.
  const aging = useMemo(() => summariseAging(unopened), [unopened]);

  const visible = useMemo(() => {
    const needle = digitsOnly(search) || search.trim().toLowerCase();
    // Ένα πακέτο που πουλήθηκε ως το τέλος δεν «τρέχει» πια στον πάγκο, και
    // μια λίστα με τελειωμένα πακέτα σταματά να απαντά στο «τι τρέχει
    // τώρα;» - που είναι ο λόγος που υπάρχει αυτή η καρτέλα. Μένουν στη
    // βάση και στο ίχνος· απλώς δεν κάθονται εδώ.
    const inGroup = packs.filter(
      (p) =>
        p.status === statusFilter &&
        (statusFilter !== 'IN_STORE' ||
          packProgress(positions[p.pack_code], p.pieces).remaining > 0)
    );
    const rows = search.trim()
      ? inGroup.filter(
          (p) =>
            p.pack_code.includes(needle) ||
            p.game_no.includes(needle) ||
            p.game_name.toLowerCase().includes(search.trim().toLowerCase())
        )
      : inGroup;
    return [...rows].sort((a, b) =>
      sortKey === 'game_no'
        ? a.game_no.localeCompare(b.game_no) || a.pack_code.localeCompare(b.pack_code)
        : a.received_at.localeCompare(b.received_at)
    );
  }, [packs, positions, search, sortKey, statusFilter]);

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

  /**
   * Σε ποια φάση είναι η αποθήκη αυτού του καταστήματος.
   *
   * Τα packs φορτώνονται σε ΟΛΕΣ τις καταστάσεις, άρα το μηδέν εδώ σημαίνει
   * «δεν έχει καταχωρηθεί ποτέ πακέτο» - η ίδια ερώτηση που απαντά και το
   * storeUsesWarehouse στη βάση για το ταμείο.
   */
  const startState = warehouseStartState({ packCount: packs.length, gameCount: games.length });

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
            Προς πώληση, αλλά όχι ακόμα ανοιγμένα — {currentStore?.name ?? storeId}
          </p>
          <p className="text-micro text-slate-400 mt-0.5">
            Παραδίδετε εσείς· το ταμείο βλέπει μόνο ό,τι παραδόθηκε και το ανοίγει.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-4 py-2 rounded-xl bg-slate-900 text-white">
            <p className="text-micro font-bold text-slate-400">{toGreekUpper('Στην αποθηκη')}</p>
            <p className="text-base font-black font-mono">{formatCurrency(totals.shelfValue)}</p>
            <p className="text-micro text-slate-400">
              {totals.shelfCount} {totals.shelfCount === 1 ? 'πακέτο' : 'πακέτα'}
            </p>
          </div>
          {/* Δικό του πλακίδιο, όχι άθροισμα με το πάνω: ένα πακέτο που
              παραδόθηκε δεν πουλήθηκε, και αν η αξία του απλώς έφευγε από
              την «αξία αποθήκης» θα ήταν 300 € που εξαφανίζονται από την
              οθόνη με ένα κλικ. */}
          <div
            className={`px-4 py-2 rounded-xl border ${
              totals.pendingCount > 0
                ? 'bg-indigo-50 border-indigo-200'
                : 'bg-slate-100 border-slate-200'
            }`}
          >
            <p className="text-micro font-bold text-slate-500">{toGreekUpper('Προς παραδοση')}</p>
            <p
              className={`text-base font-black font-mono ${
                totals.pendingCount > 0 ? 'text-indigo-900' : 'text-slate-900'
              }`}
            >
              {formatCurrency(totals.pendingValue)}
            </p>
            <p className="text-micro text-slate-500">
              {totals.pendingCount} {totals.pendingCount === 1 ? 'πακέτο' : 'πακέτα'}
            </p>
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
                {formatCurrency(aging.criticalValue)} απούλητα. Αποσύρετέ τα.
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

      {/* Δεν υπάρχει διακόπτης να ανάψει, και η οθόνη δεν το έλεγε πουθενά:
          ένα κατάστημα με άδεια αποθήκη έγραφε «Κανένα πακέτο στην αποθήκη»,
          που διαβάζεται ως βλάβη. Ο διακόπτης είναι το απόθεμα - δες
          lib/warehouseHandover.ts. */}
      {!loading && startState !== 'STARTED' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 flex items-start gap-3">
          <Boxes className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-950 space-y-1.5">
            <p className="font-black text-sm">
              Η αποθήκη αυτού του καταστήματος δεν έχει ξεκινήσει ακόμα
            </p>
            {startState === 'READY_TO_START' ? (
              <>
                <p>
                  Δεν υπάρχει ρύθμιση να ενεργοποιηθεί — <strong>ο διακόπτης είναι το
                  απόθεμα</strong>. Μόλις καταχωρηθεί το πρώτο πακέτο εδώ, το ταμείο
                  σταματά να γράφει κωδικό στο χέρι: διαλέγει από τα πακέτα που
                  παραδόθηκαν, και ένα νέο παιχνίδι δεν πωλείται πριν του παραδοθεί
                  πακέτο.
                </p>
                <p className="text-indigo-800">
                  Μέχρι τότε το ταμείο δουλεύει όπως πάντα, με πληκτρολογημένο κωδικό —
                  αυτό δεν είναι βλάβη, είναι η κατάσταση πριν την πρώτη παραλαβή.{' '}
                  <strong>
                    {games.length}{' '}
                    {games.length === 1 ? 'παιχνίδι είναι έτοιμο' : 'παιχνίδια είναι έτοιμα'}
                  </strong>{' '}
                  για παραλαβή — σκανάρετε ή γράψτε το πρώτο πακέτο παρακάτω.
                </p>
              </>
            ) : (
              <>
                <p>
                  Κανένα παιχνίδι αυτού του καταστήματος δεν έχει <strong>4ψήφιο αριθμό
                  παιχνιδιού</strong>, οπότε δεν υπάρχει τίποτα να παραληφθεί: ο 4ψήφιος
                  είναι αυτό που σκανάρεται, και χωρίς αυτόν η λίστα παραλαβής μένει άδεια.
                </p>
                <p className="text-indigo-800">
                  Συμπληρώστε τους 4ψήφιους στα παιχνίδια από τη «Διαμόρφωση» του
                  καταστήματος και η αποθήκη ξεκινά με την πρώτη καταχώρηση.
                </p>
              </>
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
        <div className="px-3 pt-3 flex items-center gap-1.5 flex-wrap">
          {(
            [
              ['IN_WAREHOUSE', 'Στην αποθήκη'],
              ['PENDING_DELIVERY', 'Προς παράδοση'],
              ['IN_STORE', 'Στο μαγαζί'],
              ['WITHDRAWN', 'Αποσυρμένα'],
            ] as Array<[PackStatus, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-micro font-bold cursor-pointer border transition-colors ${
                statusFilter === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={statusFilter === key ? 'ml-1.5 text-slate-300' : 'ml-1.5 text-slate-400'}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {statusFilter === 'IN_STORE' && finished > 0 && (
          <p className="px-3 pt-2 text-micro text-slate-400">
            {finished} {finished === 1 ? 'πακέτο ολοκληρώθηκε' : 'πακέτα ολοκληρώθηκαν'} και δεν
            εμφανίζονται εδώ.
          </p>
        )}

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
            {search.trim()
              ? 'Κανένα πακέτο δεν ταιριάζει.'
              : statusFilter === 'IN_WAREHOUSE'
              ? 'Κανένα πακέτο στην αποθήκη.'
              : statusFilter === 'PENDING_DELIVERY'
              ? 'Κανένα πακέτο προς παράδοση. Πατήστε «Παράδοση στο κατάστημα» σε ό,τι κουβαλάτε στο μαγαζί.'
              : statusFilter === 'IN_STORE'
              ? 'Κανένα πακέτο δεν έχει ανοίξει στο μαγαζί.'
              : 'Κανένα αποσυρμένο πακέτο.'}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Παιχνιδι')}</th>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Κωδικος')}</th>
                <th className="text-left p-2.5 font-black">{toGreekUpper('Παρελαβη')}</th>
                <th className="text-left p-2.5 font-black">
                  {toGreekUpper(
                    statusFilter === 'IN_STORE'
                      ? 'Προοδος πωλησης'
                      : statusFilter === 'WITHDRAWN'
                      ? 'Αποσυρση'
                      : statusFilter === 'PENDING_DELIVERY'
                      ? 'Παραδοθηκε'
                      : 'Στην αποθηκη'
                  )}
                </th>
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
                      {pack.status === 'IN_WAREHOUSE' || pack.status === 'PENDING_DELIVERY' ? (
                        <span
                          className={`font-bold ${
                            tone === 'CRITICAL' ? 'text-rose-700' : tone === 'WARNING' ? 'text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {label ?? `${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}
                          {/* Οι 90 ημέρες μετράνε από την παραλαβή· η ώρα
                              της παράδοσης απαντά σε άλλη ερώτηση - πόσο
                              κάθεται παραδομένο και κανείς δεν το ανοίγει. */}
                          {pack.status === 'PENDING_DELIVERY' && (
                            <span className="block text-micro text-slate-400 font-semibold">
                              {pack.delivered_at
                                ? `παραδόθηκε ${new Date(pack.delivered_at).toLocaleString('el-GR')}`
                                : 'παραδομένο'}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-600 block min-w-[170px]">
                          {pack.status === 'IN_STORE' ? (
                            (() => {
                              const prog = packProgress(positions[pack.pack_code], pack.pieces);
                              const tone = progressTone(prog.percent);
                              const bar =
                                tone === 'HIGH' ? 'bg-rose-500' : tone === 'MID' ? 'bg-amber-500' : 'bg-emerald-500';
                              return (
                                <>
                                  <span className="font-bold text-slate-900 font-mono">
                                    #{prog.position}
                                  </span>
                                  <span className="text-micro text-slate-500">
                                    {' '}/ {prog.pieces} · {prog.percent}%
                                  </span>
                                  <span className="block mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                    <span
                                      className={`block h-full rounded-full ${bar}`}
                                      style={{ width: `${prog.percent}%` }}
                                    />
                                  </span>
                                  <span className="block text-micro text-slate-400 mt-0.5">
                                    {prog.remaining === 0
                                      ? 'Τελείωσε'
                                      : `απομένουν ${prog.remaining}`}
                                  </span>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              Αποσύρθηκε
                              {pack.withdrawn_at && (
                                <span className="block text-micro text-slate-400">
                                  {new Date(pack.withdrawn_at).toLocaleString('el-GR')}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-slate-900">
                      {formatCurrency(pack.pieces * pack.unit_price)}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {pack.status === 'WITHDRAWN' ? (
                          <span className="text-micro text-slate-400">—</span>
                        ) : pack.status === 'IN_STORE' ? (
                          /* Διέξοδος για ό,τι ξέφυγε: πακέτο ορφανό από
                             διαγραμμένη βάρδια, λάθος κλικ, ή κενό που δεν
                             έχει βρεθεί ακόμα. Μόνο όσο δεν έχει πουλήσει
                             τίποτα - ένα πακέτο με πωλήσεις πάνω του δεν
                             ξεανοίγει, έχει αρχίσει να υπάρχει στα λεφτά
                             της ημέρας.

                             Γυρίζει στα «προς παράδοση» και όχι στο ράφι:
                             το πακέτο είναι στο μαγαζί, και ο αντμιν που
                             το έβλεπε στην αποθήκη θα το παρέδιδε δεύτερη
                             φορά. */
                          packProgress(positions[pack.pack_code], pack.pieces).sold === 0 ? (
                            <button
                              type="button"
                              disabled={busyPackId === pack.id}
                              onClick={() => act(pack, returnPackById)}
                              title="Δεν έχει πουλήσει τίποτα — αναίρεση της παραλαβής"
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-micro cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Undo2 className="w-3 h-3" />
                              Αναίρεση παραλαβής
                            </button>
                          ) : (
                            <span className="text-micro text-slate-400">πουλάει</span>
                          )
                        ) : (
                        <>
                        {/* Η πράξη του αντμιν: ένα κλικ πάνω στο πακέτο που
                            κουβαλάει στο μαγαζί. Από εκεί και πέρα είναι το
                            μόνο που βλέπει το ταμείο για το παιχνίδι του. */}
                        {pack.status === 'IN_WAREHOUSE' ? (
                          <button
                            type="button"
                            disabled={busyPackId === pack.id}
                            onClick={() => act(pack, deliverPackToStore)}
                            title="Το ταμείο θα μπορεί να το παραλάβει — και μόνο αυτό"
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-micro cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Truck className="w-3 h-3 shrink-0" />
                            {busyPackId === pack.id ? 'Παράδοση…' : 'Παράδοση στο κατάστημα'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyPackId === pack.id}
                            onClick={() => act(pack, cancelDelivery)}
                            title="Πατήθηκε σε λάθος πακέτο — πίσω στην αποθήκη"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-micro cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Undo2 className="w-3 h-3" />
                            Ακύρωση παράδοσης
                          </button>
                        )}
                        {canCorrect && (
                          <button
                            type="button"
                            onClick={() => openEdit(pack)}
                            title="Διόρθωση — λάθος κωδικός, παιχνίδι ή ημερομηνία"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-micro cursor-pointer flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Διόρθωση
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!canWithdraw(days)}
                          onClick={() => setToWithdraw(pack)}
                          title={withdrawBlockedReason(days) ?? 'Απόσυρση στον ΟΠΑΠ'}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-micro flex items-center gap-1 ${
                            canWithdraw(days)
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Απόσυρση
                        </button>
                        </>
                        )}
                        {/* Έξω από το ternary επίτηδες: η λάθος καταχώρηση
                            πρέπει να μπορεί να φύγει από ΟΠΟΙΑ θέση κι αν
                            βρίσκεται, και τα 26 δοκιμαστικά της Λαμίας
                            είναι όλα «στο μαγαζί» - τη μόνη θέση που δεν
                            είχε καμία έξοδο. */}
                        {canCorrect && (
                          <button
                            type="button"
                            disabled={busyPackId === pack.id}
                            onClick={() => setToDelete(pack)}
                            title="Μπήκε λάθος — σβήσιμο της καταχώρησης (όχι επιστροφή στον ΟΠΑΠ)"
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-micro cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3 h-3" />
                            Διαγραφή
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <Modal
          isOpen
          onClose={() => setEditing(null)}
          headerStyle="bordered"
          icon={Pencil}
          title="Διόρθωση πακέτου"
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-sm font-bold"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={!editGame || !isValidPackCode(editPackCode) || !editDate || editSaving}
                onClick={saveEdit}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5" />
                {editSaving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-micro text-slate-500">
              Διορθώνεται όσο το πακέτο δεν έχει ανοίξει — στην αποθήκη ή παραδομένο. Μόλις το
              παραλάβει το ταμείο, ο κωδικός του είναι γραμμένος μέσα στις βάρδιες.
            </p>

            <div>
              <label htmlFor="ed-game" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
                Αριθμός παιχνιδιού
              </label>
              <input
                id="ed-game"
                inputMode="numeric"
                value={editGameNo}
                onChange={(e) => setEditGameNo(digitsOnly(e.target.value).slice(0, GAME_NO_LENGTH))}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black font-mono tracking-widest text-center"
              />
              <p className="text-micro mt-1 min-h-[1rem]">
                {editGame ? (
                  <span className="text-emerald-700 font-bold">
                    {editGame.name} · {formatCurrency(editGame.price)} · {editGame.pieces} δελτία ·{' '}
                    {formatCurrency(editGame.value)}
                  </span>
                ) : (
                  <span className="text-rose-600 font-bold">Άγνωστος αριθμός παιχνιδιού.</span>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="ed-code" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
                Κωδικός πακέτου
              </label>
              <input
                id="ed-code"
                inputMode="numeric"
                value={editPackCode}
                onChange={(e) => setEditPackCode(digitsOnly(e.target.value).slice(0, PACK_CODE_LENGTH))}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black font-mono tracking-widest text-center"
              />
            </div>

            <div>
              <label htmlFor="ed-date" className="block text-micro font-black text-slate-700 uppercase tracking-wider mb-1">
                Ημερομηνία παραλαβής
              </label>
              <input
                id="ed-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold"
              />
              <p className="text-micro text-amber-700 mt-1">
                Από εδώ μετράνε οι 90 ημέρες — αλλάζοντάς την, αλλάζει και η λήξη.
              </p>
            </div>

            {editProblem && (
              <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {editProblem}
              </p>
            )}
          </div>
        </Modal>
      )}

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
            label:
              toWithdraw?.status === 'PENDING_DELIVERY' ? 'Αξία προς παράδοση' : 'Αξία αποθήκης',
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

      {/* Η διαγραφή της λάθος καταχώρησης. Λέει ΜΕ ΝΟΥΜΕΡΟ αν ο κωδικός
          έχει πωλήσεις πάνω του, γιατί αυτό είναι όλη η διαφορά ανάμεσα σε
          «σβήνω μια δοκιμή» και «σβήνω το πακέτο που πουλάει ο πάγκος». */}
      <ConfirmDestructiveModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        confirmLabel="Διαγραφή"
        what={
          toDelete ? (
            <span className="font-bold">
              την καταχώρηση του πακέτου {toDelete.pack_code} — {toDelete.game_name},{' '}
              {formatCurrency(toDelete.pieces * toDelete.unit_price)}
            </span>
          ) : null
        }
        lines={
          toDelete
            ? [
                {
                  label: 'Αξία αποθήκης',
                  detail: `μειώνεται κατά ${formatCurrency(toDelete.pieces * toDelete.unit_price)}`,
                  fate: 'GOES' as const,
                },
                {
                  label: 'Η γραμμή του πακέτου',
                  detail: 'σβήνεται οριστικά — δεν μένει ως αποσυρμένο',
                  fate: 'GOES' as const,
                },
                packProgress(positions[toDelete.pack_code], toDelete.pieces).sold > 0
                  ? {
                      label: 'ΠΡΟΣΟΧΗ',
                      detail: `ο κωδικός έχει ${
                        packProgress(positions[toDelete.pack_code], toDelete.pieces).sold
                      } δελτία πουλημένα σε βάρδιες — οι πωλήσεις ΜΕΝΟΥΝ, το ταμείο θα κρατάει κωδικό που η αποθήκη δεν έχει`,
                      fate: 'STAYS' as const,
                    }
                  : {
                      label: 'Πωλήσεις',
                      detail: 'καμία — ο κωδικός δεν εμφανίζεται σε καμία βάρδια',
                      fate: 'STAYS' as const,
                    },
                {
                  label: 'Ίχνος',
                  detail: 'η διαγραφή καταγράφεται στο ημερολόγιο ενεργειών',
                  fate: 'STAYS' as const,
                },
              ]
            : []
        }
        onConfirm={async () => {
          if (!toDelete) return;
          await deletePackById(toDelete.id);
          await load();
        }}
      />
    </div>
  );
};
