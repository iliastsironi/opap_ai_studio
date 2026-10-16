import React, { useState, useEffect } from 'react';
import { Clock, Play, AlertCircle, CheckCircle2, RefreshCw, Info, Lock, Sparkles, ArrowRight, Building2, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift, ShiftType, ShiftStatus } from '../../types/index.ts';
import { createShiftInFirestore, fetchHandoverSnapshot, HandoverSnapshot } from '../../services/shiftService.ts';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { calculateBanknotesAndCoins, roundCurrency } from '../../services/financialCalculator.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { Modal } from '../ui/Modal.tsx';
import {
  carryOverScratchInventory,
  getLatestStoreScratchInventory,
} from './ScratchCalculatorTable.tsx';

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
    if (isOpen) {
      if (!selectedStoreId || !effectiveStores.some((s) => s.id === selectedStoreId)) {
        if (effectiveStores.length > 0) {
          setSelectedStoreId(effectiveStores[0].id);
        }
      }
    }
  }, [isOpen, effectiveStores, selectedStoreId]);

  const [registerId, setRegisterId] = useState<string>('Ταμείο 1');
  const [shiftType, setShiftType] = useState<ShiftType>('MORNING');
  const [openingBanknotes, setOpeningBanknotes] = useState<string>('150.00');
  const [openingCoins, setOpeningCoins] = useState<string>('50.00');
  // The store's configured starting float. Defaults match what this screen
  // used to hardcode, so nothing moves until an Owner sets their own.
  const [floatNotes, setFloatNotes] = useState<number>(150);
  const [floatCoins, setFloatCoins] = useState<number>(50);
  const [floatEditableByEmployee, setFloatEditableByEmployee] = useState(false);
  // The opening float decides what the till is measured against at close, so
  // by default it is not set by the person being measured. A store can open it
  // up in «Διαμόρφωση».
  const canSetFloat = hasPermission('organization.update') || hasPermission('store.update');
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
    async function loadPrevShift() {
      setFetchingPrev(true);
      try {
        // Goes through shift_handover_snapshot() rather than reading the
        // previous shift row: since 0022 a closed shift is private to whoever
        // worked it, and at a handover that is someone else.
        const [prev, config] = await Promise.all([
          fetchHandoverSnapshot(selectedStoreId, registerId),
          getShiftTemplateConfig(organization!.id, selectedStoreId).catch(() => null),
        ]);

        if (!isMounted) return;

        const floatNotes = Number(config?.opening_float_notes ?? 150);
        const floatCoins = Number(config?.opening_float_coins ?? 50);
        setFloatNotes(floatNotes);
        setFloatCoins(floatCoins);
        setFloatEditableByEmployee(config?.opening_float_employee_editable === true);
        setPreviousShift(prev);

        if (prev) {
          // Calculate physical cash breakdown from previous shift
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

          // The coins carry over either way. They are the physical ψιλά left in
          // the drawer overnight - nobody counts them out and banks them, so
          // starting a morning on a round figure would be inventing a number
          // and then measuring the till against it.
          setOpeningCoins(prevCoins.toFixed(2));

          if (shiftType === 'MORNING') {
            // The notes are set fresh for the day, from the store's configured
            // float, because the night's takings go to the safe.
            setOpeningBanknotes(floatNotes.toFixed(2));
            // Not «auto», so the morning notes stay editable: this is the one
            // figure somebody genuinely puts in the drawer by hand.
            setIsAutoFetched(false);
          } else {
            setOpeningBanknotes(prevNotes.toFixed(2));
            setIsAutoFetched(true);
          }
        } else if (shiftType === 'MORNING') {
          setOpeningBanknotes(floatNotes.toFixed(2));
          setOpeningCoins(floatCoins.toFixed(2));
          setIsAutoFetched(false);
        } else {
          // Non-morning, and this register has no previous shift to carry from.
          //
          // This branch did not exist, and the effect re-runs on registerId -
          // so picking «Ταμείο 1» (snapshot found: fields filled with 350 and
          // locked, AUTO lit) and then switching to «Ταμείο 2» left the 350
          // sitting there, still locked, still badged AUTO, above a line
          // reading «Δεν βρέθηκε προηγούμενη βάρδια». The operator could not
          // even correct it - the inputs are disabled while isAutoFetched -
          // and the shift was written with a note claiming the float had been
          // carried over from a shift that does not exist, while the till in
          // front of them was empty.
          //
          // Clearing rather than keeping: there is no previous close to carry,
          // so the only honest float is the one they are about to count.
          setOpeningBanknotes('');
          setOpeningCoins('');
          setIsAutoFetched(false);
        }
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
  }, [isOpen, selectedStoreId, registerId, shiftType, organization?.id]);

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
      // Calculate carry-over scratch inventory from previous shift
      const prevScratchItems =
        previousShift?.scratch_ticket_items ||
        getLatestStoreScratchInventory(targetStoreId);
      const initialScratchInventory = carryOverScratchInventory(prevScratchItems);

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
        opened_at: new Date().toISOString(),
        opening_cash: cashNum,
        opening_cash_notes: banknotesNum,
        opening_cash_coins: coinsNum,
        opening_operational_notes: openingNotes
          ? openingNotes
          : shiftType !== 'MORNING' && isAutoFetched
          ? `Αυτόματη μεταφορά από προηγούμενη βάρδια (${formatCurrency(banknotesNum)} χαρτ. + ${formatCurrency(coinsNum)} κέρμ.)`
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
        discrepancy_threshold: 15,
        is_unbalanced: false,
        custom_field_values: {
          scratch_ticket_items: initialScratchInventory,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      onSuccess(fsShift.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα επικοινωνίας με το διακομιστή');
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
        shiftType === 'MORNING'
          ? 'Ορισμός αρχικού ταμείου από διαχειριστή'
          : 'Αυτόματη μεταφορά ταμείου από προηγούμενη βάρδια'
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
                  <option value="MORNING">☀️ Πρωινή (Ορισμός Ταμείου)</option>
                  <option value="AFTERNOON">🌤️ Απογευματινή (Αυτόματο)</option>
                  <option value="NIGHT">🌙 Βραδινή (Αυτόματο)</option>
                  <option value="CUSTOM">⚡ Ειδική / Έκτακτη (Αυτόματο)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Shift Type Notice Banner */}
          {shiftType === 'MORNING' ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  ☀️ {toGreekUpper('Πρωινη Βαρδια — Αρχικο Ταμειο Διαχειριστη')}
                </span>
                <span className="text-micro text-amber-800 font-medium">
                  Στην πρωινή βάρδια το αρχικό κεφάλαιο/ταμείο ορίζεται χειροκίνητα από τον διαχειριστή ή υπεύθυνο.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start space-x-2.5">
              <RefreshCw className={`w-4 h-4 text-indigo-600 shrink-0 mt-0.5 ${fetchingPrev ? 'animate-spin' : ''}`} />
              <div>
                <span className="font-bold flex items-center gap-1.5">
                  🔄 {toGreekUpper('Αυτοματη Μεταφορα απο Προηγουμενη Βαρδια')}
                  {isAutoFetched && (
                    <span className="px-1.5 py-0.2 text-micro font-black bg-indigo-200 text-indigo-950 rounded-md uppercase">
                      AUTO
                    </span>
                  )}
                </span>
                <span className="text-micro text-indigo-800 font-medium block mt-0.5">
                  {previousShift
                    ? `Τα μετρητά και τα κέρματα υπολογίστηκαν αυτόματα από τη λήξη της προηγούμενης βάρδιας (${previousShift.previous_operator_name || 'Προηγούμενη'}).`
                    : 'Δεν βρέθηκε προηγούμενη βάρδια σε αυτό το ταμείο — καταμετρήστε και καταχωρήστε το αρχικό ταμείο.'}
                </span>
              </div>
            </div>
          )}

          {/* Group 2: Opening Cash Float Breakdown */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-micro font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>{toGreekUpper('2. Αρχικο Ταμειο (Float €)')}</span>
                {shiftType !== 'MORNING' && (
                  <span className="text-micro text-indigo-700 font-bold border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                    {toGreekUpper('Απο Προηγουμενη')}
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
                  {shiftType !== 'MORNING' && (
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
                    disabled={(shiftType !== 'MORNING' && isAutoFetched) || (!canSetFloat && !floatEditableByEmployee)}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      shiftType !== 'MORNING' && isAutoFetched
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
                  {shiftType !== 'MORNING' && (
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
                    disabled={(shiftType !== 'MORNING' && isAutoFetched) || (!canSetFloat && !floatEditableByEmployee)}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      shiftType !== 'MORNING' && isAutoFetched
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
              {shiftType === 'MORNING'
                ? 'Ορίστε τα χαρτονομίσματα και τα κέρματα που παραδίδονται στο ταμείο.'
                : 'Τα ποσά χαρτονομισμάτων και κερμάτων προέρχονται αυτόματα από τα υπόλοιπα της προηγούμενης βάρδιας.'}
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
                shiftType === 'MORNING'
                  ? 'Π.χ. Παραδόθηκαν 200€ από τον διαχειριστή, όλα τα τερματικά λειτουργικά...'
                  : 'Π.χ. Παραλαβή ταμείου από προηγούμενη βάρδια...'
              }
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
      </div>
    </Modal>
  );
};
