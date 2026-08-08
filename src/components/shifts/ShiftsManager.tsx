import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Filter,
  Search,
  Eye,
  Building2,
  Coins,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Bug,
  Code,
  Copy,
  Check,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift, ShiftStatus } from '../../types/index.ts';
import { ShiftOpeningModal } from './ShiftOpeningModal.tsx';
import { ShiftClosingWizard } from './ShiftClosingWizard.tsx';
import { ShiftDetailsModal } from './ShiftDetailsModal.tsx';
import { ShiftTemplateConfigurator } from './ShiftTemplateConfigurator.tsx';
import {
  fetchShiftsFromFirestore,
  subscribeToShifts,
} from '../../services/shiftService.ts';

import { INITIAL_DEMO_STORES } from '../../services/storeService.ts';
import {
  calculateCountedCash,
  calculateExpectedCash,
  calculateDiscrepancy,
  calculateTotalReconciliationCount,
  safeNum,
} from '../../services/financialCalculator.ts';

export const ShiftsManager: React.FC = () => {
  const { token, organization, roles, hasPermission, assignedStores } = useAuth();
  const { currentStore, stores: tenantStores, setStoreId } = useTenant();

  const isOwnerOrAdmin =
    roles?.some((r) => ['ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_ADMIN'].includes(r.code)) ||
    hasPermission('roles.manage');

  const canApprove =
    roles?.some(
      (r) =>
        ['ORG_OWNER', 'STORE_MANAGER', 'ADMIN', 'AREA_MANAGER', 'PLATFORM_ADMIN', 'SHIFT_LEADER'].includes(r.code) ||
        r.name?.toLowerCase().includes('manager') ||
        r.name?.toLowerCase().includes('owner') ||
        r.name?.toLowerCase().includes('διευθυντής') ||
        r.name?.toLowerCase().includes('ιδιοκτήτης')
    ) ||
    hasPermission('*') ||
    hasPermission('shift.approve') ||
    hasPermission('shifts.approve');

  const availableStores =
    assignedStores && assignedStores.length > 0
      ? assignedStores.map((s) => ({
          id: s.store_id,
          name: s.store_name || s.store_code,
          code: s.store_code || '',
        }))
      : tenantStores.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        }));

  const effectiveStores =
    availableStores.length > 0
      ? availableStores
      : INITIAL_DEMO_STORES.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        }));

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [managerTab, setManagerTab] = useState<'SHIFTS' | 'TEMPLATE'>('SHIFTS');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modals & Active Wizard
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [wizardShift, setWizardShift] = useState<Shift | null>(null);
  const [detailsShift, setDetailsShift] = useState<Shift | null>(null);

  // Diagnostic Tool state & calculation
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [selectedDiagnosticShiftId, setSelectedDiagnosticShiftId] = useState<string | null>(null);
  const [copiedDebug, setCopiedDebug] = useState(false);

  const diagShift =
    shifts.find((s) => s.id === selectedDiagnosticShiftId) || activeShift || shifts[0] || null;

  const getDiagnosticData = (s: Shift | null) => {
    if (!s) return null;

    const opening = safeNum(s.opening_cash);
    const opapGross = safeNum(s.opap_gross_sales);
    const opapPayouts = safeNum(s.opap_payouts);
    const vltsIn = safeNum(s.vlts_cash_in);
    const vltsOut = safeNum(s.vlts_cash_out);
    const scratchLotto = safeNum(s.scratch_lotto_sales);
    const fnbCash = safeNum(s.fnb_cash);
    const creditCollected = safeNum(s.customer_credit_collected);

    const cardPayments = safeNum(s.card_payments);
    const expensesCash = safeNum(s.expenses_paid_cash);
    const creditGranted = safeNum(s.customer_credit_granted);
    const deposits = safeNum(s.bank_deposits);

    const subtotalInflows = opening + opapGross + vltsIn + scratchLotto + fnbCash + creditCollected;
    const subtotalOutflows = opapPayouts + vltsOut + cardPayments + expensesCash + creditGranted + deposits;

    const recalculatedExpected = calculateExpectedCash({
      opening_cash: opening,
      opap_gross_sales: opapGross,
      opap_payouts: opapPayouts,
      vlts_cash_in: vltsIn,
      vlts_cash_out: vltsOut,
      scratch_lotto_sales: scratchLotto,
      fnb_cash: fnbCash,
      customer_credit_collected: creditCollected,
      card_payments: cardPayments,
      expenses_paid_cash: expensesCash,
      customer_credit_granted: creditGranted,
      bank_deposits: deposits,
    });

    const countedCash = calculateCountedCash(s.counted_denominations || {});
    const discResult = calculateDiscrepancy(countedCash, recalculatedExpected, s.discrepancy_threshold || 10.0);

    const totalReconciliationCount = calculateTotalReconciliationCount({
      openingCash: opening,
      countedCashInDrawer: countedCash,
      posSalesTotal: cardPayments,
      expensesTotal: expensesCash,
      bankDeposits: deposits,
      customerCreditsGranted: creditGranted,
      customerReturns: creditCollected,
    });

    return {
      shift_metadata: {
        shift_id: s.id,
        store_id: s.store_id,
        store_name: s.store_name,
        register_id: s.register_id,
        status: s.status,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opened_by: s.opened_by_user_name,
      },
      cash_reconciliation_variables: {
        opening_cash: opening,
        inflows: {
          opap_gross_sales: opapGross,
          vlts_cash_in: vltsIn,
          scratch_lotto_sales: scratchLotto,
          fnb_cash: fnbCash,
          customer_credit_collected: creditCollected,
          subtotal_inflows: subtotalInflows,
        },
        outflows: {
          opap_payouts: opapPayouts,
          vlts_cash_out: vltsOut,
          card_payments_store_pos: cardPayments,
          expenses_paid_cash: expensesCash,
          customer_credit_granted: creditGranted,
          bank_deposits: deposits,
          subtotal_outflows: subtotalOutflows,
        },
      },
      computed_results: {
        stored_expected_cash: s.expected_cash,
        recalculated_expected_cash: recalculatedExpected,
        stored_counted_cash: s.counted_cash,
        recalculated_counted_cash: countedCash,
        stored_discrepancy: s.discrepancy,
        recalculated_discrepancy: discResult.discrepancy,
        discrepancy_percentage: discResult.discrepancyPercentage,
        is_unbalanced: discResult.isUnbalanced,
        is_exceeding_threshold: discResult.isExceedingThreshold,
        discrepancy_threshold: s.discrepancy_threshold || 10.0,
        total_reconciliation_count: totalReconciliationCount,
      },
      formulas: {
        expected_cash: "scratch_lotto_sales + card_payments + vlts_cash_in - vlts_cash_out + (opap_gross_sales - opap_payouts) + fnb_cash",
        discrepancy: "recalculated_counted_cash - recalculated_expected_cash",
        grand_reconciliation_total: "opening_cash + (Καταμετρητής Χαρτονομισμάτων & Κερμάτων) + POS_ανεξάρτητο + expenses_paid_cash + bank_deposits + customer_credit_granted - customer_credit_collected"
      },
      custom_field_values: s.custom_field_values || {},
      counted_denominations: s.counted_denominations || {},
    };
  };

  const orgId = organization?.id || 'org_opap_demo';

  // Fetch list of shifts
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fsData = await fetchShiftsFromFirestore(orgId, selectedStoreFilter, selectedStatusFilter);
      setShifts(fsData);

      // Find active shift for current store
      const active = fsData.find(
        (s) =>
          s.store_id === (currentStore?.id || 'store_opap_01') &&
          ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status)
      );
      setActiveShift(active || null);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα ανάκτησης βαρδιών');
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedStoreFilter, selectedStatusFilter, currentStore?.id]);

  useEffect(() => {
    fetchShifts();

    // Setup real-time listener for live shift state changes
    const unsub = subscribeToShifts(orgId, selectedStoreFilter, (updatedShifts) => {
      let filtered = updatedShifts;
      if (selectedStatusFilter !== 'ALL') {
        filtered = updatedShifts.filter((s) => s.status === selectedStatusFilter);
      }
      setShifts(filtered);

      const active = updatedShifts.find(
        (s) =>
          s.store_id === (currentStore?.id || 'store_opap_01') &&
          ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status)
      );
      setActiveShift(active || null);
      setLoading(false);
    });

    return () => unsub();
  }, [orgId, selectedStoreFilter, selectedStatusFilter, currentStore?.id, fetchShifts]);

  // Handle open wizard for specific shift
  const handleOpenWizard = (shiftToClose: Shift) => {
    setWizardShift(shiftToClose);
  };

  // If active closing wizard is open
  if (wizardShift) {
    return (
      <ShiftClosingWizard
        shift={wizardShift}
        onBack={() => setWizardShift(null)}
        onSubmitted={() => {
          setWizardShift(null);
          fetchShifts();
        }}
      />
    );
  }

  const canCreate = hasPermission('shift.create') || hasPermission('shifts.create') || hasPermission('shifts.view') || true;

  // Filter list of pending shifts for manager notification
  const pendingApprovalShifts = shifts.filter((s) => s.status === 'SUBMITTED');
  const pendingApprovalCount = pendingApprovalShifts.length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Διαχείριση Βαρδιών & Ταμείου</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Έναρξη βάρδιας, καταχώρηση ημερήσιων εισπράξεων/εξόδων & καταμέτρηση ταμείου.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isOwnerOrAdmin && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 max-w-full overflow-x-auto">
              <button
                onClick={() => setManagerTab('SHIFTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  managerTab === 'SHIFTS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Λίστα Βαρδιών
              </button>
              <button
                onClick={() => setManagerTab('TEMPLATE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  managerTab === 'TEMPLATE'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Διαμόρφωση Φόρμας</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs ${
              showDiagnostics
                ? 'bg-slate-900 text-emerald-400 border-slate-900 ring-2 ring-emerald-500/30'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Διαγνωστικό Εργαλείο Cash Reconciliation Math JSON"
          >
            <Bug className="w-4 h-4 text-emerald-500" />
            <span>Διαγνωστικό Math (JSON)</span>
          </button>

          <button
            onClick={fetchShifts}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            title="Aνανέωση"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {canCreate && (
            <button
              onClick={() => setShowOpeningModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Έναρξη Νέας Βάρδιας</span>
            </button>
          )}
        </div>
      </div>

      {managerTab === 'TEMPLATE' && isOwnerOrAdmin ? (
        <ShiftTemplateConfigurator />
      ) : (
        <>
          {/* Diagnostic Cash Reconciliation Debug Panel */}
          {showDiagnostics && (
            <div className="bg-slate-900 border-2 border-slate-700 text-slate-100 rounded-2xl p-5 shadow-xl space-y-4 font-sans">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-extrabold text-base text-white tracking-wide flex items-center gap-2">
                        <span>🛠️ Cash Reconciliation Diagnostic Tool & Variables</span>
                      </h3>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        MATH VERIFICATION
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Επιλέξτε βάρδια για έλεγχο όλων των μεταβλητών, τύπων υπολογισμού & JSON debug output.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedDiagnosticShiftId || diagShift?.id || ''}
                    onChange={(e) => setSelectedDiagnosticShiftId(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 px-3 py-2 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.store_name} ({s.register_id}) - {s.status} - {new Date(s.opened_at).toLocaleDateString('el-GR')}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      const data = getDiagnosticData(diagShift);
                      if (data) {
                        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                        setCopiedDebug(true);
                        setTimeout(() => setCopiedDebug(false), 2000);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    {copiedDebug ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedDebug ? 'Αντιγράφηκε!' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>

              {diagShift ? (
                <div className="space-y-4">
                  {/* Quick Key Variable Metrics */}
                  {(() => {
                    const diag = getDiagnosticData(diagShift);
                    if (!diag) return null;
                    const { computed_results, cash_reconciliation_variables } = diag;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">1. Opening Float (Αρχικό)</span>
                          <span className="text-lg font-black text-slate-100 font-mono mt-0.5 block">
                            {cash_reconciliation_variables.opening_cash.toFixed(2)} €
                          </span>
                        </div>

                        <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">2. Expected Cash (Αναμενόμενο)</span>
                          <span className="text-lg font-black text-emerald-400 font-mono mt-0.5 block">
                            {computed_results.recalculated_expected_cash.toFixed(2)} €
                          </span>
                          <span className="text-[9px] text-slate-500">Form: Inflows - Outflows</span>
                        </div>

                        <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">3. Counted Cash (Καταμετρημένο)</span>
                          <span className="text-lg font-black text-indigo-400 font-mono mt-0.5 block">
                            {computed_results.recalculated_counted_cash.toFixed(2)} €
                          </span>
                          <span className="text-[9px] text-slate-500">Sum Denominations</span>
                        </div>

                        <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">4. Discrepancy (Απόκλιση)</span>
                          <span
                            className={`text-lg font-black font-mono mt-0.5 block ${
                              computed_results.recalculated_discrepancy < 0
                                ? 'text-rose-400'
                                : computed_results.recalculated_discrepancy > 0
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {computed_results.recalculated_discrepancy > 0 ? '+' : ''}
                            {computed_results.recalculated_discrepancy.toFixed(2)} €
                          </span>
                          <span className="text-[9px] text-slate-500">Counted - Expected</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* JSON Code Viewer & Detailed Inflows/Outflows Comparison */}
                  {(() => {
                    const diag = getDiagnosticData(diagShift);
                    if (!diag) return null;
                    const { cash_reconciliation_variables, computed_results } = diag;
                    const { inflows, outflows, opening_cash } = cash_reconciliation_variables;

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* INFLOWS COLUMN */}
                        <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4">
                          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 mb-3">
                            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span>🟢 INFLOWS (Εισροές Μετρητών)</span>
                            </span>
                            <span className="text-xs font-mono font-extrabold text-emerald-400">
                              +{inflows.subtotal_inflows.toFixed(2)} €
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs font-mono">
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">1. Opening Float (opening_cash)</span>
                              <span className="font-bold text-slate-200">+{opening_cash.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">2. OPAP Gross Cash (opap_gross_sales)</span>
                              <span className="font-bold text-emerald-400">+{inflows.opap_gross_sales.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">3. VLTs Cash In (vlts_cash_in)</span>
                              <span className="font-bold text-emerald-400">+{inflows.vlts_cash_in.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">4. Scratch & Lotto (scratch_lotto_sales)</span>
                              <span className="font-bold text-emerald-400">+{inflows.scratch_lotto_sales.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">5. F&B Cash Sales (fnb_cash)</span>
                              <span className="font-bold text-emerald-400">+{inflows.fnb_cash.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">6. Credit Collected (customer_credit_collected)</span>
                              <span className="font-bold text-emerald-400">+{inflows.customer_credit_collected.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-extrabold mt-2">
                              <span>TOTAL INFLOWS</span>
                              <span>+{inflows.subtotal_inflows.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>

                        {/* OUTFLOWS COLUMN */}
                        <div className="bg-slate-950/80 border border-rose-500/30 rounded-xl p-4">
                          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-3">
                            <span className="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span>🔴 OUTFLOWS (Εκροές Μετρητών)</span>
                            </span>
                            <span className="text-xs font-mono font-extrabold text-rose-400">
                              -{outflows.subtotal_outflows.toFixed(2)} €
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs font-mono">
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">1. OPAP Payouts (opap_payouts)</span>
                              <span className="font-bold text-rose-400">-{outflows.opap_payouts.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">2. VLT Cash Out (vlts_cash_out)</span>
                              <span className="font-bold text-rose-400">-{outflows.vlts_cash_out.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">3. POS Card Payments (card_payments)</span>
                              <span className="font-bold text-amber-400">-{outflows.card_payments_store_pos.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">4. Paid Out Expenses (expenses_paid_cash)</span>
                              <span className="font-bold text-rose-400">-{outflows.expenses_paid_cash.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">5. New Credit Granted (customer_credit_granted)</span>
                              <span className="font-bold text-rose-400">-{outflows.customer_credit_granted.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-1.5 rounded-lg bg-slate-900/60 text-slate-300">
                              <span className="text-slate-400">6. Bank Drops / Safe (bank_deposits)</span>
                              <span className="font-bold text-rose-400">-{outflows.bank_deposits.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-extrabold mt-2">
                              <span>TOTAL OUTFLOWS</span>
                              <span>-{outflows.subtotal_outflows.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* JSON Code Viewer */}
                  <div className="relative">
                    <div className="flex items-center justify-between bg-slate-950 px-4 py-2 rounded-t-xl border border-slate-800 border-b-0 text-[11px] font-mono text-slate-400">
                      <div className="flex items-center space-x-2">
                        <Code className="w-3.5 h-3.5 text-emerald-400" />
                        <span>shift_cash_reconciliation_debug.json</span>
                      </div>
                      <span className="text-slate-500">ID: {diagShift.id}</span>
                    </div>
                    <pre className="bg-slate-950 text-emerald-400 p-4 rounded-b-xl font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed max-h-96">
                      {JSON.stringify(getDiagnosticData(diagShift), null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Δεν υπάρχει επιλεγμένη βάρδια για διάγνωση.</p>
              )}
            </div>
          )}


      {/* Manager Awaiting Approval Notification Banner */}
      {canApprove && pendingApprovalCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 border-2 border-amber-400/50 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Εκκρεμούν {pendingApprovalCount} {pendingApprovalCount === 1 ? 'Βάρδια' : 'Βάρδιες'} για Έγκριση
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
                    AWAITING APPROVAL
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Οι παρακάτω βάρδιες υποβλήθηκαν από το προσωπικό και απαιτούν έγκριση & έλεγχο διευθυντή.
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedStatusFilter === 'SUBMITTED'
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                  : 'bg-white text-slate-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              {selectedStatusFilter === 'SUBMITTED' ? 'Εμφάνιση Όλων' : `Φιλτράρισμα Εκκρεμοτήτων (${pendingApprovalCount})`}
            </button>
          </div>

          {/* Quick Cards of Pending Shifts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingApprovalShifts.map((pShift) => (
              <div
                key={pShift.id}
                className="bg-white rounded-xl border border-amber-300 p-3.5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-1">
                      {pShift.store_name} ({pShift.register_id === 'REG-01' ? 'Ταμείο 1' : pShift.register_id})
                    </span>
                    <span className="font-extrabold text-slate-900 text-xs block">
                      {pShift.opened_by_user_name || 'Υπάλληλος'} •{' '}
                      {pShift.shift_type === 'MORNING'
                        ? 'Πρωινή'
                        : pShift.shift_type === 'AFTERNOON'
                        ? 'Απογευματινή'
                        : 'Βραδινή'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      {new Date(pShift.closed_at || pShift.opened_at).toLocaleDateString('el-GR')}{' '}
                      {new Date(pShift.closed_at || pShift.opened_at).toLocaleTimeString('el-GR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 block font-bold">Απόκλιση</span>
                    <span
                      className={`font-black text-xs font-mono ${
                        pShift.discrepancy < 0
                          ? 'text-rose-600'
                          : pShift.discrepancy > 0
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {pShift.discrepancy > 0 ? '+' : ''}
                      {pShift.discrepancy.toFixed(2)} €
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setDetailsShift(pShift)}
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Επιθεώρηση & Έγκριση</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Shift Prompt Banner */}
      {activeShift && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-indigo-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm text-white">
                  ΕΝΕΡΓΗ ΒΑΡΔΙΑ ΣΕ ΕΞΕΛΙΞΗ
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950">
                  {activeShift.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {activeShift.store_name} ({activeShift.register_id}) • Αρχικό Ταμείο:{' '}
                <strong>{Number(activeShift.opening_cash).toFixed(2)} €</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenWizard(activeShift)}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all shrink-0"
          >
            <span>Οδηγός Κλεισίματος Ταμείου</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedStoreFilter}
            onChange={(e) => setSelectedStoreFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-800 bg-white max-w-full"
          >
            <option value="ALL">Όλα τα Καταστήματα</option>
            {effectiveStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-800 bg-white max-w-full"
          >
            <option value="ALL">Όλες οι Καταστάσεις</option>
            <option value="OPEN">Ανοικτές (OPEN)</option>
            <option value="DRAFT_CLOSING">Πρόχειρο (DRAFT)</option>
            <option value="SUBMITTED">Υποβληθείσες (SUBMITTED)</option>
            <option value="APPROVED">Εγκεκριμένες (APPROVED)</option>
            <option value="CORRECTION_REQUESTED">Αίτηση Διόρθωσης</option>
          </select>
        </div>

        <span className="text-slate-400 font-medium">
          Σύνολο: <strong>{shifts.length}</strong> βάρδιες
        </span>
      </div>

      {/* Shifts List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-medium">Φόρτωση βαρδιών...</p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Clock className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν βάρδιες</p>
            <p className="text-xs text-slate-400">
              Ξεκινήστε μια νέα βάρδια πατώντας το κουμπί "Έναρξη Νέας Βάρδιας".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Κατάστημα & Ταμείο</th>
                  <th className="px-4 py-3">Τύπος / Ημερομηνία</th>
                  <th className="px-4 py-3">Χρήστης</th>
                  <th className="px-4 py-3">Αναμενόμενο / Καταμετρημένο</th>
                  <th className="px-4 py-3">Απόκλιση</th>
                  <th className="px-4 py-3">Κατάσταση</th>
                  <th className="px-4 py-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {shifts.map((s) => (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      s.status === 'SUBMITTED'
                        ? 'bg-amber-50/40 hover:bg-amber-50 border-l-4 border-l-amber-500'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{s.store_name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {s.register_id === 'REG-01' ? 'Ταμείο 1' : s.register_id}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800">
                        {s.shift_type === 'MORNING'
                          ? 'Πρωινή'
                          : s.shift_type === 'AFTERNOON'
                          ? 'Απογευματινή'
                          : 'Βραδινή'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(s.opened_at).toLocaleDateString('el-GR')}{' '}
                        {new Date(s.opened_at).toLocaleTimeString('el-GR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">
                        {s.opened_by_user_name || 'Υπάλληλος'}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div>
                        <span className="font-bold text-slate-900">
                          {s.expected_cash.toFixed(2)} €
                        </span>{' '}
                        / <span className="text-indigo-700">{s.counted_cash.toFixed(2)} €</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`font-extrabold ${
                          s.discrepancy < 0
                            ? 'text-rose-600'
                            : s.discrepancy > 0
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {s.discrepancy > 0 ? '+' : ''}
                        {s.discrepancy.toFixed(2)} €
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          s.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : s.status === 'SUBMITTED'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                            : s.status === 'CORRECTION_REQUESTED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            : s.status === 'OPEN'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {s.status === 'APPROVED'
                          ? 'Εγκεκριμένη'
                          : s.status === 'SUBMITTED'
                          ? 'Εκκρεμεί έγκριση'
                          : s.status === 'CORRECTION_REQUESTED'
                          ? 'Αίτημα διόρθωσης'
                          : s.status === 'OPEN'
                          ? 'Ανοιχτή'
                          : s.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-1.5">
                      {['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                        s.status
                      ) && (
                        <button
                          onClick={() => handleOpenWizard(s)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors cursor-pointer"
                        >
                          Κλείσιμο
                        </button>
                      )}

                      {s.status === 'SUBMITTED' && canApprove && (
                        <button
                          onClick={() => setDetailsShift(s)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                          title="Επιθεώρηση & Έγκριση"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Έγκριση</span>
                        </button>
                      )}

                      <button
                        onClick={() => setDetailsShift(s)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Προβολή
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift Opening Modal */}
      <ShiftOpeningModal
        isOpen={showOpeningModal}
        onClose={() => setShowOpeningModal(false)}
        onSuccess={(shiftId) => {
          fetchShifts();
        }}
        stores={effectiveStores}
      />

      {/* Shift Details Modal */}
      <ShiftDetailsModal
        shift={detailsShift}
        isOpen={Boolean(detailsShift)}
        onClose={() => setDetailsShift(null)}
        onRefresh={fetchShifts}
        onOpenClosingWizard={(s) => setWizardShift(s)}
      />
      </>
      )}
    </div>
  );
};

