import React, { useState, useEffect } from 'react';
import { Clock, Play, AlertCircle, X, CheckCircle2, RefreshCw, Info, Lock, Sparkles, ArrowRight, Building2, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { INITIAL_DEMO_STORES } from '../../services/storeService.ts';
import { Shift, ShiftType, ShiftStatus } from '../../types/index.ts';
import { createShiftInFirestore, fetchLatestShiftForRegister } from '../../services/shiftService.ts';
import { calculateBanknotesAndCoins, roundCurrency } from '../../services/financialCalculator.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
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
  const { user, organization } = useAuth();
  const { stores: tenantStores } = useTenant();

  const effectiveStores =
    stores && stores.length > 0
      ? stores
      : tenantStores && tenantStores.length > 0
      ? tenantStores.map((s) => ({ id: s.id, name: s.name, code: s.code }))
      : INITIAL_DEMO_STORES.map((s) => ({ id: s.id, name: s.name, code: s.code }));

  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    effectiveStores[0]?.id || 'store_opap_01'
  );

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
  const [openingNotes, setOpeningNotes] = useState<string>('');

  const [previousShift, setPreviousShift] = useState<Shift | null>(null);
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
        const prev = await fetchLatestShiftForRegister(
          organization?.id || 'org_opap_demo',
          selectedStoreId,
          registerId
        );

        if (!isMounted) return;
        setPreviousShift(prev);

        if (shiftType !== 'MORNING' && prev) {
          // Calculate physical cash breakdown from previous shift
          let prevNotes = 0;
          let prevCoins = 0;

          if (prev.counted_denominations && Object.keys(prev.counted_denominations).length > 0) {
            const parsed = calculateBanknotesAndCoins(prev.counted_denominations);
            prevNotes = parsed.banknotes;
            prevCoins = parsed.coins;
          } else if (prev.counted_cash > 0) {
            prevNotes = Math.floor(prev.counted_cash);
            prevCoins = roundCurrency(prev.counted_cash - prevNotes);
          } else if (prev.opening_cash > 0) {
            prevNotes = prev.opening_cash_notes ?? Math.floor(prev.opening_cash);
            prevCoins = prev.opening_cash_coins ?? roundCurrency(prev.opening_cash - prevNotes);
          }

          setOpeningBanknotes(prevNotes.toFixed(2));
          setOpeningCoins(prevCoins.toFixed(2));
          setIsAutoFetched(true);
        } else if (shiftType === 'MORNING') {
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
    const targetStoreId = activeStore?.id || selectedStoreId || 'store_opap_01';

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
        previousShift?.custom_field_values?.scratch_ticket_items ||
        getLatestStoreScratchInventory(targetStoreId);
      const initialScratchInventory = carryOverScratchInventory(prevScratchItems);

      const fsShift = await createShiftInFirestore({
        organization_id: organization?.id || 'org_opap_demo',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Play className="w-5 h-5 ml-0.5 fill-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">
                {toGreekUpper('Εναρξη Νεας Βαρδιας')}
              </h3>
              <p className="text-xs text-slate-300">
                {shiftType === 'MORNING'
                  ? 'Ορισμός αρχικού ταμείου από διαχειριστή'
                  : 'Αυτόματη μεταφορά ταμείου από προηγούμενη βάρδια'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Group 1: Store & Register Setup (Responsive Grid on Tablet) */}
          <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              {toGreekUpper('1. Στοιχεια Καταστηματος & Ταμειου')}
            </span>

            <div>
              <label htmlFor="opening-store" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                <label htmlFor="opening-register" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                <label htmlFor="opening-shift-type" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                <span className="text-[11px] text-amber-800 font-medium">
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
                    <span className="px-1.5 py-0.2 text-[9px] font-black bg-indigo-200 text-indigo-950 rounded-md uppercase">
                      AUTO
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-indigo-800 font-medium block mt-0.5">
                  {previousShift
                    ? `Τα μετρητά και τα κέρματα υπολογίστηκαν αυτόματα από τη λήξη της προηγούμενης βάρδιας (${previousShift.opened_by_user_name || 'Προηγούμενη'}).`
                    : 'Δεν βρέθηκε προηγούμενη βάρδια. Εμφανίζονται τα προεπιλεγμένα ποσά.'}
                </span>
              </div>
            </div>
          )}

          {/* Group 2: Opening Cash Float Breakdown */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>{toGreekUpper('2. Αρχικο Ταμειο (Float €)')}</span>
                {shiftType !== 'MORNING' && (
                  <span className="text-[10px] text-indigo-700 font-bold border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 rounded-md">
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
                <label htmlFor="opening-banknotes" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                  <span>💵 {toGreekUpper('Χαρτονομισματα')} (€)</span>
                  {shiftType !== 'MORNING' && (
                    <span className="text-[9px] text-slate-400 font-mono">{toGreekUpper('Αυτοματο')}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="opening-banknotes"
                    type="text"
                    inputMode="decimal"
                    value={openingBanknotes}
                    onChange={(e) => setOpeningBanknotes(e.target.value)}
                    placeholder="150.00"
                    disabled={shiftType !== 'MORNING' && isAutoFetched}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      shiftType !== 'MORNING' && isAutoFetched
                        ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-90'
                        : 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500'
                    }`}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    €
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="opening-coins" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                  <span>🪙 {toGreekUpper('Κερματα')} (€)</span>
                  {shiftType !== 'MORNING' && (
                    <span className="text-[9px] text-slate-400 font-mono">{toGreekUpper('Αυτοματο')}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="opening-coins"
                    type="text"
                    inputMode="decimal"
                    value={openingCoins}
                    onChange={(e) => setOpeningCoins(e.target.value)}
                    placeholder="50.00"
                    disabled={shiftType !== 'MORNING' && isAutoFetched}
                    className={`w-full pl-3 pr-8 py-2 rounded-xl border text-sm font-bold font-mono text-slate-900 ${
                      shiftType !== 'MORNING' && isAutoFetched
                        ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-90'
                        : 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500'
                    }`}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    €
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {shiftType === 'MORNING'
                ? 'Ορίστε τα χαρτονομίσματα και τα κέρματα που παραδίδονται στο ταμείο.'
                : 'Τα ποσά χαρτονομισμάτων και κερμάτων προέρχονται αυτόματα από τα υπόλοιπα της προηγούμενης βάρδιας.'}
            </p>
          </div>

          {/* Group 3: Operational Notes */}
          <div>
            <label htmlFor="opening-notes" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              {toGreekUpper('Σημειωσεις Εναρξης (Προαιρετικο)')}
            </label>
            <textarea
              id="opening-notes"
              value={openingNotes}
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

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
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
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
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
          </div>
        </form>
      </div>
    </div>
  );
};
