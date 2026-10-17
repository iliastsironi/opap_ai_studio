import React, { useState, useEffect } from 'react';
import { Clock, Play, AlertCircle, CheckCircle2, RefreshCw, Info, Lock, Sparkles, ArrowRight, Building2, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

/** `YYYY-MM-DDTHH:mm` in local time, which is what datetime-local expects. */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift, ShiftType, ShiftStatus } from '../../types/index.ts';
import {
  createShiftInFirestore, fetchHandoverSnapshot, HandoverSnapshot,
  fetchDayOpening, DayOpeningSnapshot, recordShiftInspection,
} from '../../services/shiftService.ts';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { resolveOpeningFloat } from '../../lib/openingFloat.ts';
import { athensDateKey } from '../../lib/pnlEngine.ts';
import { calculateBanknotesAndCoins, roundCurrency } from '../../services/financialCalculator.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { Modal } from '../ui/Modal.tsx';
import {
  carryOverScratchInventory,
  continueDayScratchInventory,
  getLatestStoreScratchInventory,
} from './ScratchCalculatorTable.tsx';
import { SCRATCH_DAY_BASELINE_KEY } from '../../lib/scratchDayBaseline.ts';
import {
  InspectionLine, summariseInspection, inspectionStatusFor, lineFinding,
} from '../../lib/shiftInspection.ts';
import {
  ShiftInspectionPanel, buildInspectionLines, applyInspectionToScratchRows,
} from './ShiftInspectionPanel.tsx';

interface ShiftOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shiftId: string) => void;
  stores?: Array<{ id: string; name: string; code: string }>;
}

export const ShiftOpeningModal: React.FC<ShiftOpeningModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stores,
}) => {
  const { user, organization, hasPermission } = useAuth();
  const { stores: tenantStores } = useTenant();

  const effectiveStores =
    stores && stores.length > 0
      ? stores
      : (tenantStores ?? []).map((s) => ({ id: s.id, name: s.name, code: s.code }));

  // No `|| 'store_opap_01'`: that id is not in the database, so defaulting to
  // it produced a foreign-key failure at the one moment an operator is trying
  // to start their shift. Empty means "no store chosen yet", which the submit
  // guard below already refuses.
  const [selectedStoreId, setSelectedStoreId] = useState<string>(effectiveStores[0]?.id ?? '');

  useEffect(() => {
    // Re-seeded each time the dialog opens, so it never shows a time from
    // whenever the screen last rendered.
    if (isOpen) setOpenedAt(localDateTimeValue(new Date()));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (!selectedStoreId || !effectiveStores.some((s) => s.id === selectedStoreId)) {
        if (effectiveStores.length > 0) {
          setSelectedStoreId(effectiveStores[0].id);
        }
      }
    }
  }, [isOpen, effectiveStores, selectedStoreId]);

  const [registerId, setRegisterId] = useState<string>('Ταμείο 1');
  // When the shift actually started. Defaults to now; an Owner can set it in
  // the past, which is how the 27 August workbooks that were never imported
  // get entered after the fact.
  const [openedAt, setOpenedAt] = useState<string>('');
  const [shiftType, setShiftType] = useState<ShiftType>('MORNING');
  const [openingBanknotes, setOpeningBanknotes] = useState<string>('150.00');
  const [openingCoins, setOpeningCoins] = useState<string>('50.00');
  // The store's configured starting float. Defaults match what this screen
  // used to hardcode, so nothing moves until an Owner sets their own.
  const [floatNotes, setFloatNotes] = useState<number>(150);
  const [floatCoins, setFloatCoins] = useState<number>(50);
  const [configuredThreshold, setConfiguredThreshold] = useState<number>(15);
  const [morningCoinsCarryOver, setMorningCoinsCarryOver] = useState<boolean>(true);
  // What today started on, when this shift is continuing a day rather than
  // starting one. Null means this IS the day's first shift.
  const [dayOpening, setDayOpening] = useState<DayOpeningSnapshot | null>(null);
  // Set when the day-opening lookup itself failed, as opposed to there being
  // no shift today. The figures below then came from the previous close, which
  // is NOT the day rule, so the operator has to be told rather than shown a
  // number that looks official.
  const [dayOpeningError, setDayOpeningError] = useState<string | null>(null);

  // Η επιθεώρηση. Built once the previous handover and the resolved float are
  // known, because «expected» is exactly what this screen is about to write
  // into the shift - not a figure invented for the inspection.
  const [inspectionLines, setInspectionLines] = useState<InspectionLine[] | null>(null);
  const [inspectionSkipped, setInspectionSkipped] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [floatEditableByEmployee, setFloatEditableByEmployee] = useState(false);
  // The opening float decides what the till is measured against at close, so
  // by default it is not set by the person being measured. A store can open it
  // up in «Διαμόρφωση».
  // The float is set once, in «Διαμόρφωση», and applied from there. It is
  // asked for here only when a store has explicitly said it may be changed
  // inside a shift - otherwise this screen would put the same question in
  // front of somebody every morning about a number that already has an
  // answer, which is what «ορίζεται χειροκίνητα από τον διαχειριστή» meant in
  // practice.
  //
  // Deliberately not «unless you are the Owner»: the Owner is who sets it in
  // the configuration, so asking them again here is the same question twice.
  const floatIsAsked = floatEditableByEmployee;
  // Back-dating a shift is the Owner's, separately from the float.
  const canBackdate = hasPermission('organization.update') || hasPermission('store.update');
  const [openingNotes, setOpeningNotes] = useState<string>('');

  const [previousShift, setPreviousShift] = useState<HandoverSnapshot | null>(null);
  const [isAutoFetched, setIsAutoFetched] = useState<boolean>(false);
  const [fetchingPrev, setFetchingPrev] = useState<boolean>(false);

  const banknotesNum = parseFloat(openingBanknotes.replace(',', '.')) || 0;
  const coinsNum = parseFloat(openingCoins.replace(',', '.')) || 0;
  const totalOpeningCash = banknotesNum + coinsNum;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically fetch previous shift details and carry over cash/coins for non-morning shifts
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    // The Athens calendar day this shift will belong to, read off the form's
    // own date field, so every day-based lookup below agrees with what gets
    // written. Blank means now, which is what the submit handler does too.
    const shiftStartIso = (openedAt ? new Date(openedAt) : new Date()).toISOString();
    const shiftDayKey = athensDateKey(shiftStartIso);

    async function loadPrevShift() {
      setFetchingPrev(true);
      try {
        // Goes through shift_handover_snapshot() rather than reading the
        // previous shift row: since 0022 a closed shift is private to whoever
        // worked it, and at a handover that is someone else.
        const [prev, config, today] = await Promise.all([
          fetchHandoverSnapshot(selectedStoreId, registerId, shiftStartIso),
          getShiftTemplateConfig(organization!.id, selectedStoreId).catch(() => null),
          // The day's opening, for the day THIS shift will be recorded on -
          // not for today.
          //
          // «opened_at» is a field on this form and the retroactive-entries
          // feature exists precisely so it can be backdated. Asking for today
          // while writing a shift dated otherwise made the two disagree: a
          // shift recorded on 1 September found no opening for «today», fell
          // back to the previous close, and the operator was shown the coins
          // that close had counted. Which is exactly what was reported.
          fetchDayOpening(selectedStoreId, registerId, shiftDayKey),
        ]);

        if (!isMounted) return;

        const floatNotes = Number(config?.opening_float_notes ?? 150);
        const floatCoins = Number(config?.opening_float_coins ?? 50);
        setFloatNotes(floatNotes);
        setFloatCoins(floatCoins);
        setFloatEditableByEmployee(config?.opening_float_employee_editable === true);
        setConfiguredThreshold(Number(config?.discrepancy_threshold ?? 15));
        const carryCoins = (config as any)?.morning_coins_carry_over !== false;
        setMorningCoinsCarryOver(carryCoins);
        setPreviousShift(prev);
        const todaySnapshot = today.status === 'FOUND' ? today.snapshot : null;
        setDayOpening(todaySnapshot);
        setDayOpeningError(today.status === 'FAILED' ? today.message : null);

        const configuredFloat = {
          notes: floatNotes,
          coins: floatCoins,
          morningCoinsCarryOver: carryCoins,
        };

        let resolvedFloat = { notes: floatNotes, coins: floatCoins };

        if (todaySnapshot) {
          // A shift is already on record for today, so this one continues the
          // day: same opening figures, not up for renegotiation at 15:00.
          const float = resolveOpeningFloat(null, configuredFloat, {
            notes: Number(todaySnapshot.opening_cash_notes ?? 0),
            coins: Number(todaySnapshot.opening_cash_coins ?? 0),
          });
          resolvedFloat = { notes: float.notes, coins: float.coins };
          setOpeningBanknotes(float.notes.toFixed(2));
          setOpeningCoins(float.coins.toFixed(2));
          setIsAutoFetched(float.carriedOver);
        } else {
          // The day's first shift. The notes reset to the float - last
          // night's left in the envelope - and the coins carry over if the
          // shop keeps its ψιλά in the drawer overnight.
          //
          // This used to be two more branches keyed on shiftType, and one of
          // them cleared the fields entirely. They have collapsed into this
          // one because «is this the morning» stopped deciding anything: a
          // store whose day starts at 15:00 is still starting its day, and it
          // starts on the float either way. That also retires the bug the
          // cleared branch existed for - switching from «Ταμείο 1» to
          // «Ταμείο 2» left the first register's figure sitting there locked
          // and badged AUTO - because nothing is locked here now.
          let previousClose = null;
          if (prev) {
            let prevNotes = 0;
            let prevCoins = 0;
            const countedCash = Number(prev.counted_cash ?? 0);
            const openingCash = Number(prev.opening_cash ?? 0);

            if (prev.counted_denominations && Object.keys(prev.counted_denominations).length > 0) {
              const parsed = calculateBanknotesAndCoins(prev.counted_denominations);
              prevNotes = parsed.banknotes;
              prevCoins = parsed.coins;
            } else if (countedCash > 0) {
              prevNotes = Math.floor(countedCash);
              prevCoins = roundCurrency(countedCash - prevNotes);
            } else if (openingCash > 0) {
              prevNotes = Number(prev.opening_cash_notes ?? Math.floor(openingCash));
              prevCoins = Number(prev.opening_cash_coins ?? roundCurrency(openingCash - prevNotes));
            }
            previousClose = { countedCash, openingCash, notes: prevNotes, coins: prevCoins };
          }

          const float = resolveOpeningFloat(previousClose, configuredFloat, null);
          resolvedFloat = { notes: float.notes, coins: float.coins };
          setOpeningBanknotes(float.notes.toFixed(2));
          setOpeningCoins(float.coins.toFixed(2));
          setIsAutoFetched(float.carriedOver);
        }
        // The inspection is offered only for a handover that is finished,
        // belongs to somebody else, and nobody has checked yet. The RPC
        // refuses all three cases anyway; offering them would waste the
        // operator's time and then error.
        const inspectable = prev
          && prev.shift_id
          && (prev.shift_status === 'SUBMITTED' || prev.shift_status === 'APPROVED')
          && !prev.inspection_status
          && prev.opened_by_user_id !== user?.id;

        if (inspectable) {
          setInspectionLines(
            buildInspectionLines(resolvedFloat, (prev!.scratch_ticket_items ?? []) as any[])
          );
        } else {
          setInspectionLines(null);
        }
        setInspectionSkipped(false);
        setInspectionError(null);
      } catch (e) {
        console.warn('Error loading previous shift:', e);
      } finally {
        if (isMounted) setFetchingPrev(false);
      }
    }

    loadPrevShift();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedStoreId, registerId, openedAt, organization?.id]);

  // The question the screen actually needs to answer. It used to ask «is this
  // the morning», which decided the wrong thing: a store whose day starts at
  // 15:00 sets its own opening, and a second morning shift would not.
  const continuingDay = !!dayOpening;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const activeStore = effectiveStores.find((s) => s.id === selectedStoreId) || effectiveStores[0];
    // The `|| 'store_opap_01'` that used to close this expression made the
    // guard below unreachable: there was always a truthy id, so instead of
    // «Παρακαλώ επιλέξτε κατάστημα» the operator got a shift opened against a
    // store that does not exist in the database.
    const targetStoreId = activeStore?.id || selectedStoreId;

    if (!targetStoreId) {
      setError('Παρακαλώ επιλέξτε κατάστημα.');
      return;
    }

    const cashNum = totalOpeningCash;
    if (isNaN(cashNum) || cashNum < 0) {
      setError('Παρακαλώ εισάγετε έγκυρο αρχικό ποσό ταμείου.');
      return;
    }

    setLoading(true);
    try {
      // The opening serials, under the same rule as the cash: a shift that
      // continues a day starts from the figures the DAY started on, and only
      // across the night does a close become an opening.
      //
      //   continuing  -> «τη θέση της ημέρας»
      //   first shift -> last night's close becomes this morning's opening
      // Gated on the baseline field actually being there, not just on the day
      // being open. Until 0035 is applied the RPC returns six columns and
      // scratch_gross_today is undefined - and counting from the day's opening
      // with a baseline of 0 would store the running total as this shift's
      // own, reporting the day at two or three times what was sold. With the
      // guard, running the migration late costs nothing: shifts simply carry
      // per-shift, exactly as before.
      const canContinueDay = dayOpening != null
        && dayOpening.scratch_gross_today !== null
        && dayOpening.scratch_gross_today !== undefined;

      // A corrected serial is the true position, so it is what this shift opens
      // on - the whole point of the morning check. Applied to the declared
      // rows BEFORE the carry-over turns closings into openings.
      const declaredRows = applyInspectionToScratchRows(
        previousShift?.scratch_ticket_items ?? null,
        inspectionSkipped ? null : inspectionLines
      );

      const initialScratchInventory = canContinueDay
        ? continueDayScratchInventory(dayOpening!.scratch_ticket_items ?? undefined)
        : carryOverScratchInventory(
            declaredRows || getLatestStoreScratchInventory(targetStoreId)
          );

      // Because the table now counts from the day's opening, the figure the
      // operator will see at closing is the DAY's running total, not this
      // shift's. The baseline is what lets the close subtract the difference
      // back out, so scratch_lotto_sales keeps the per-shift meaning every
      // report in 0003 sums.
      //
      // Stamped at opening rather than looked up at closing: a shift reopened
      // and corrected days later has to subtract what the day held when it was
      // worked, not what it holds now.
      const scratchDayBaseline = canContinueDay
        ? Math.max(0, Number(dayOpening!.scratch_gross_today))
        : 0;

      const fsShift = await createShiftInFirestore({
        organization_id: organization!.id,
        store_id: targetStoreId,
        store_name: activeStore?.name || 'OPAP Agency',
        store_code: activeStore?.code || 'STR-01',
        register_id: registerId,
        shift_type: shiftType,
        status: 'OPEN' as ShiftStatus,
        opened_by_user_id: user?.id || 'usr_anonymous',
        opened_by_user_name: user ? `${user.first_name} ${user.last_name}` : 'Χρήστης',
        opened_at: (openedAt ? new Date(openedAt) : new Date()).toISOString(),
        opening_cash: cashNum,
        opening_cash_notes: banknotesNum,
        opening_cash_coins: coinsNum,
        opening_operational_notes: openingNotes
          ? openingNotes
          : isAutoFetched
          ? `Συνέχεια ημέρας — αρχικό ταμείο ημέρας (${formatCurrency(banknotesNum)} χαρτ. + ${formatCurrency(coinsNum)} κέρμ.)`
          : 'Αρχικό ταμείο διαχειριστή',
        opap_gross_sales: 0,
        opap_payouts: 0,
        opap_net_sales: 0,
        vlts_cash_in: 0,
        vlts_cash_out: 0,
        vlts_net: 0,
        scratch_lotto_sales: 0,
        fnb_sales: 0,
        fnb_cash: 0,
        fnb_card: 0,
        card_payments: 0,
        expenses_paid_cash: 0,
        customer_credit_granted: 0,
        customer_credit_collected: 0,
        bank_deposits: 0,
        counted_denominations: {},
        counted_cash: 0,
        expected_cash: cashNum,
        discrepancy: 0,
        discrepancy_percentage: 0,
        // The store's own limit, from «Διαμόρφωση». This was a hardcoded 15,
        // so changing the setting moved what the closing wizard displayed and
        // not what the shift was actually judged against.
        discrepancy_threshold: configuredThreshold,
        is_unbalanced: false,
        custom_field_values: {
          scratch_ticket_items: initialScratchInventory,
          [SCRATCH_DAY_BASELINE_KEY]: scratchDayBaseline,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Recorded after the shift exists, and never allowed to block it. If
      // the RPC fails the operator still has a till to work - the shop cannot
      // wait on a bookkeeping write - so the failure is surfaced instead of
      // thrown, and the handover simply stays uninspected.
      if (inspectionLines && previousShift?.shift_id) {
        const summary = summariseInspection(inspectionLines);
        const outcome = inspectionSkipped ? 'SKIPPED' : inspectionStatusFor(summary);
        try {
          await recordShiftInspection(
            previousShift.shift_id,
            outcome,
            outcome === 'FLAGGED' ? summary.shortfall : 0,
            inspectionSkipped
              ? { skipped: true }
              : {
                  lines: inspectionLines.map((l) => ({
                    key: l.key,
                    label: l.label,
                    kind: l.kind,
                    expected: l.expected,
                    found: l.found ?? l.expected,
                    unit_price: l.unitPrice ?? null,
                    shortfall: lineFinding(l).shortfall,
                  })),
                }
          );
        } catch (inspErr: any) {
          console.warn('Inspection could not be recorded:', inspErr);
          setInspectionError(
            `Η βάρδια ξεκίνησε, αλλά η επιθεώρηση δεν καταγράφηκε: ${
              inspErr?.message || 'άγνωστο σφάλμα'
            }`
          );
        }
      }

      onSuccess(fsShift.id);
      onClose();
    } catch (err: any) {
      // ux_shifts_one_active_per_register: one shift at a time per till. Worth
      // naming, because back-dating a shift while today's is still open is
      // exactly when somebody meets it, and «duplicate key value violates
      // unique constraint» explains nothing to whoever is standing there.
      if (err?.code === '23505' || /unique constraint/i.test(err?.message ?? '')) {
        setError(
          'Υπάρχει ήδη ανοιχτή βάρδια σε αυτό το ταμείο. Κλείστε την πρώτα, ή επιλέξτε άλλο ταμείο.'
        );
      } else {
        setError(err.message || 'Σφάλμα επικοινωνίας με το διακομιστή');
      }
    } finally {
      setLoading(false);
    }
  };

  const footerActions = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
      >
        {toGreekUpper('Ακυρωση')}
      </button>
      <button
        type="submit"
        disabled={loading || fetchingPrev}
        className="px-5 py-2.5 rounded-xl active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Άνοιγμα...</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>{toGreekUpper('Επιβεβαιωση & Εναρξη')}</span>
          </>
        )}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={toGreekUpper('Εναρξη Νεας Βαρδιας')}
      subtitle={
        continuingDay
          ? 'Συνέχεια της ημέρας — ίδιο αρχικό ταμείο'
          : 'Ορισμός αρχικού ταμείου από διαχειριστή'
      }
      icon={Play}
      size="lg"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={footerActions}
    >
      <div className="space-y-4 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Group 1: Store & Register Setup (Responsive Grid on Tablet) */}
          <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-micro font-black text-slate-500 uppercase tracking-wider block">
              {toGreekUpper('1. Στοιχεια Καταστηματος & Ταμειου')}
            </span>

            <div>
              <label htmlFor="opening-store" className="block text-micro font-bold text-slate-700 uppercase tracking-wider mb-1">
                {toGreekUpper('Καταστημα')} <span className="text-rose-500">*</span>
              </label>
              <select
                id="opening-store"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="">-- Επιλέξτε Κατάστημα --</option>
                {effectiveStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cash Register */}
              <div>
                <label htmlFor="opening-register" className="block text-micro font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {toGreekUpper('Ταμειο / Register')}
                </label>
                <select
                  id="opening-register"
                  value={registerId}
                  onChange={(e) => setRegisterId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="Ταμείο 1">Ταμείο 1</option>
                  <option value="Ταμείο 2">Ταμείο 2</option>
                  <option value="Ταμείο 3">Ταμείο 3</option>
                </select>
              </div>

              {canBackdate && (
                <div className="sm:col-span-2">
                  <label htmlFor="opening-when" className="block text-micro font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {toGreekUpper('Εναρξη Βαρδιας')}
                  </label>
                  <input
                    id="opening-when"
                    type="datetime-local"
                    value={openedAt}
                    max={localDateTimeValue(new Date())}
                    onChange={(e) => setOpenedAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-micro text-slate-500 mt-1 leading-relaxed">
                    Αφήστε το ως έχει για τώρα. Βάλτε περασμένη ημερομηνία για να καταχωρήσετε
                    βάρδια που έγινε ήδη — το ταμείο θα μετρηθεί κανονικά, απλώς θα ανήκει σε
                    εκείνη την ημέρα.
                  </p>
                </div>
              )}

              {/* Shift Type */}
              <div>
                <label htmlFor="opening-shift-type" className="block text-micro font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {toGreekUpper('Τυπος Βαρδιας')}
                </label>
                <select
                  id="opening-shift-type"
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as ShiftType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {/* The «(Αυτόματο)» these labels used to carry became a
                      lie: whether the float is set or inherited depends on
                      whether the day is already open, not on the label. The
                      banner below says which applies. */}
                  <option value="MORNING">☀️ Πρωινή</option>
                  <option value="AFTERNOON">🌤️ Απογευματινή</option>
                  <option value="NIGHT">🌙 Βραδινή</option>
                  <option value="CUSTOM">⚡ Ειδική / Έκτακτη</option>
                </select>
              </div>
            </div>
          </div>

          {/* A failed day-opening lookup is not a fresh day. The figures below
              came from the previous close instead, which is the rule this
              screen stopped using - so say so rather than let the operator
              start a till on the last shift's takings. */}
          {dayOpeningError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  {toGreekUpper('Δεν Διαβαστηκε το Ταμειο Ημερας')}
                </span>
                <span className="text-micro text-rose-800 font-medium block mt-0.5">
                  Τα παρακάτω ποσά ΔΕΝ είναι το αρχικό ταμείο της ημέρας — προέρχονται από
                  το προηγούμενο κλείσιμο. Καταμετρήστε το συρτάρι πριν συνεχίσετε.
                  <span className="block font-mono mt-0.5 opacity-80">{dayOpeningError}</span>
                </span>
              </div>
            </div>
          )}

          {/* Where the opening figures come from. Keyed on whether the day is
              already open, not on the shift's label. */}
          {!continuingDay ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  ☀️ {toGreekUpper(dayOpeningError
                    ? 'Αρχικο Ταμειο — Χειροκινητη Καταμετρηση'
                    : 'Πρωτη Βαρδια Ημερας — Αρχικο Ταμειο Διαχειριστη')}
                </span>
                <span className="text-micro text-amber-800 font-medium">
                  Τα ποσά έρχονται από τη Διαμόρφωση του καταστήματος και ισχύουν για
                  όλη την ημέρα.
                  {morningCoinsCarryOver
                    ? ' Τα κέρματα κρατούν ό,τι έμεινε στο συρτάρι από το προηγούμενο βράδυ, αν έχει καταμετρηθεί.'
                    : ' Τα κέρματα ξεκινούν από το ορισμένο αρχικό ταμείο.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start space-x-2.5">
              <RefreshCw className={`w-4 h-4 text-indigo-600 shrink-0 mt-0.5 ${fetchingPrev ? 'animate-spin' : ''}`} />
              <div>
                <span className="font-bold flex items-center gap-1.5">
                  🔄 {toGreekUpper('Συνεχεια Ημερας — Αρχικο Ταμειο Ημερας')}
                  {isAutoFetched && (
                    <span className="px-1.5 py-0.2 text-micro font-black bg-indigo-200 text-indigo-950 rounded-md uppercase">
                      AUTO
                    </span>
                  )}
                </span>
                <span className="text-micro text-indigo-800 font-medium block mt-0.5">
                  {`Ίδια αρχικά ποσά με την πρώτη βάρδια της ημέρας${
                    dayOpening?.opened_by_user_name ? ` (${dayOpening.opened_by_user_name})` : ''
                  }. Ο φάκελος κάθε κλεισίματος παραδίδεται και στο συρτάρι μένει το πάγιο κεφάλαιο.`}
                </span>
              </div>
            </div>
          )}

          {/* Η επιθεώρηση sits ABOVE the float, because its whole point is
              that the operator checks the drawer before accepting the figure
              the screen is offering them. */}
          {inspectionLines && (
            <ShiftInspectionPanel
              previousOperatorName={previousShift?.previous_operator_name || 'την προηγούμενη βάρδια'}
              lines={inspectionLines}
              skipped={inspectionSkipped}
              disabled={loading}
              onChangeFound={(key, found) => {
                setInspectionLines((current) =>
                  (current ?? []).map((l) => (l.key === key ? { ...l, found } : l))
                );
                // A correction IS the new shift's opening. Leaving the float
                // at the declared figure while the drawer holds something
                // else would measure this operator against money that is not
                // there - and hand them a shortage on their own close for
                // the previous shift's gap.
                if (key === 'cash') setOpeningBanknotes(found.toFixed(2));
                if (key === 'coins') setOpeningCoins(found.toFixed(2));
              }}
              onSkip={() => setInspectionSkipped(true)}
            />
          )}

          {inspectionError && (
            <div className="p-3 rounded-xl bg-rose-100 border border-rose-300 text-xs font-semibold text-rose-900">
              {inspectionError}
            </div>
          )}

          {/* Group 2: Opening Cash Float Breakdown */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-micro font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>{toGreekUpper('2. Αρχικο Ταμειο (Float €)')}</span>
                {continuingDay && (
                  <span className="text-micro text-indigo-700 font-bold border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                    {toGreekUpper('Ταμειο Ημερας')}
                  </span>
                )}
              </span>
              <span className="text-xs font-black font-mono text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                {toGreekUpper('Συνολο')}: {formatCurrency(totalOpeningCash)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="opening-banknotes" className="block text-micro font-bold text-slate-600 mb-1 flex items-center justify-between">
                  <span>💵 {toGreekUpper('Χαρτονομισματα')} (€)</span>
                  {continuingDay && (
                    <span className="text-micro text-slate-500 font-mono">{toGreekUpper('Αυτοματο')}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="opening-banknotes"
                    type="text"
                    inputMode="decimal"
                    maxLength={MAX_LABEL_LENGTH}
                    value={openingBanknotes}
                    onChange={(e) => setOpeningBanknotes(e.target.value)}
                    placeholder="150.00"
                    disabled={!floatIsAsked || isAutoFetched}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      isAutoFetched
                        ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-90'
                        : 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500'
                    }`}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    €
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="opening-coins" className="block text-micro font-bold text-slate-600 mb-1 flex items-center justify-between">
                  <span>🪙 {toGreekUpper('Κερματα')} (€)</span>
                  {continuingDay && (
                    <span className="text-micro text-slate-500 font-mono">{toGreekUpper('Αυτοματο')}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="opening-coins"
                    type="text"
                    inputMode="decimal"
                    maxLength={MAX_LABEL_LENGTH}
                    value={openingCoins}
                    onChange={(e) => setOpeningCoins(e.target.value)}
                    placeholder="50.00"
                    disabled={!floatIsAsked || isAutoFetched}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      isAutoFetched
                        ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-90'
                        : 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500'
                    }`}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    €
                  </span>
                </div>
              </div>
            </div>

            <p className="text-micro text-slate-500">
              {continuingDay
                ? 'Τα ποσά είναι αυτά που όρισε η πρώτη βάρδια της ημέρας και δεν αλλάζουν μέσα στην ημέρα.'
                : morningCoinsCarryOver
                ? 'Προκαθορισμένα από τη Διαμόρφωση. Τα κέρματα μεταφέρονται από το προηγούμενο βράδυ όταν έχουν καταμετρηθεί.'
                : 'Προκαθορισμένα από τη Διαμόρφωση.'}
            </p>

            {/* The limit this shift will be judged against, shown where it is
                decided rather than only at the close. */}
            <p className="text-micro text-slate-500 flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <span>Όριο αποδεκτής απόκλισης</span>
              <span className="font-mono font-bold text-slate-700">
                {configuredThreshold.toFixed(2)} €
              </span>
            </p>
          </div>

          {/* Group 3: Operational Notes */}
          <div>
            <label htmlFor="opening-notes" className="block text-micro font-bold text-slate-700 uppercase tracking-wider mb-1">
              {toGreekUpper('Σημειωσεις Εναρξης (Προαιρετικο)')}
            </label>
            <textarea
              id="opening-notes"
              value={openingNotes}
              maxLength={MAX_NOTES_LENGTH}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder={
                continuingDay
                  ? 'Π.χ. Παραλαβή βάρδιας, όλα τα τερματικά λειτουργικά...'
                  : 'Π.χ. Παραδόθηκαν 200€ από τον διαχειριστή, όλα τα τερματικά λειτουργικά...'
              }
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
      </div>
    </Modal>
  );
};
