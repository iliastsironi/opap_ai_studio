import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  Building2,
  Coins,
  Receipt,
  UserCheck,
  FileText,
  Eye,
  ShieldAlert,
  Trash2,
  Scale,
  ArrowRight,
  TrendingUp,
  Banknote,
  CreditCard,
  Layers,
  HelpCircle,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Shift } from '../../types/index.ts';
import { ShiftStatusBadge } from '../ui/StatusBadge.tsx';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { SUCCESS_MODAL_CLOSE_MS } from '../../lib/timing.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';
import { ShiftLedgerSheet } from './ShiftLedgerSheet.tsx';
import { ShiftReceiptPrintView, ShiftReceiptData } from './ShiftReceiptPrintView.tsx';
import { HandoverReceipts } from '../notifications/HandoverReceipts.tsx';
import { fetchShiftReconciliationExpenses, type ExpenseRecord } from '../../services/moduleServices.ts';
import { isCarriedExpense } from '../../lib/expenseCarry.ts';
import { carriedFromStored } from '../../lib/posBatchClose.ts';
import {
  byCustomer,
  creditLineTotals,
  creditLinesFor,
} from '../../lib/shiftCreditLines.ts';
import { fetchShiftCustomerCredits } from '../../services/customerCreditService.ts';
import { collectionSummary, shouldShowCollection, type CollectableShift } from '../../lib/collectionSummary.ts';
import { fetchDayCollection } from '../../services/shiftService.ts';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import {
  safeNum,
  roundCurrency,
  calculateBanknotesAndCoins,
  EUR_DENOMINATIONS,
  resolveVltNet,
} from '../../services/financialCalculator.ts';
import {
  calculateRowQty,
  calculateRowTotal,
  calculateCombinedRowQty,
  isLotteryRow,
  isBundleTrackedRow,
  getCountingMode,
  hasBackSide,
  parseNonNegativeInt,
  splitPiecesIntoBundles,
  ScratchTicketRow,
} from './ScratchCalculatorTable.tsx';


interface ShiftDetailsModalProps {
  shift: Shift | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenClosingWizard?: (shift: Shift) => void;
  onDeleteRequest?: (shift: Shift) => void;
}

export const ShiftDetailsModal: React.FC<ShiftDetailsModalProps> = ({
  shift,
  isOpen,
  onClose,
  onRefresh,
  onOpenClosingWizard,
  onDeleteRequest,
}) => {
  const { hasPermission, roles } = useAuth();
  const [activeTab, setActiveTab] = useState<'RECONCILIATION' | 'SHEET' | 'SUMMARY'>('RECONCILIATION');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [managerNotes, setManagerNotes] = useState('');
  const [actionType, setActionType] = useState<'CORRECTION' | 'REOPEN'>('CORRECTION');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);

  /**
   * The shift's expenses, from the table they actually live in.
   *
   * The RPC returns the whole day's, which is what the reconciliation was
   * measured against - so a manager approving the shift sees the same set
   * the till did, with the inherited ones marked.
   */
  const [shiftExpenses, setShiftExpenses] = useState<ExpenseRecord[]>([]);
  /** The credits that actually reached each customer's balance. */
  const [postedCredits, setPostedCredits] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    let cancelled = false;
    if (!shift?.id) return undefined;
    fetchShiftReconciliationExpenses(shift.id)
      .then((rows) => { if (!cancelled) setShiftExpenses(rows ?? []); })
      .catch((err) => console.warn('[ShiftDetailsModal] could not load the expenses:', err));
    return () => { cancelled = true; };
  }, [shift?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!shift?.id) return undefined;
    fetchShiftCustomerCredits(shift.id)
      .then((rows) => { if (!cancelled) setPostedCredits(rows ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shift?.id]);

  const ownExpenses = shiftExpenses.filter(
    (e) => !isCarriedExpense(e as any, shift?.id ?? '', shift?.opened_at)
  );
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [approveSucceeded, setApproveSucceeded] = useState(false);
  const [reopenSucceededMsg, setReopenSucceededMsg] = useState<string | null>(null);


  const isManagerOrOwner =
    roles?.some((r) =>
      ['ORG_OWNER', 'STORE_MANAGER', 'ADMIN', 'AREA_MANAGER', 'PLATFORM_ADMIN'].includes(r.code) ||
      r.name?.toLowerCase().includes('manager') ||
      r.name?.toLowerCase().includes('owner') ||
      r.name?.toLowerCase().includes('διευθυντής') ||
      r.name?.toLowerCase().includes('ιδιοκτήτης')
    ) ||
    hasPermission('*') ||
    hasPermission('shift.approve') ||
    hasPermission('shifts.approve');

  const canApprove = isManagerOrOwner || hasPermission('shift.approve') || hasPermission('shifts.approve');
  const canReopen = isManagerOrOwner || hasPermission('shift.reopen') || canApprove;

  /**
   * What somebody physically collects, across the whole day (0050).
   *
   * Only for a manager or the owner - the RPC refuses anyone else, since
   * «how much cash is there to pick up» is not an employee's question about
   * another operator's shift.
   */
  const [dayCollection, setDayCollection] = useState<CollectableShift[]>([]);
  const [collectionMode, setCollectionMode] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!shift?.id || !isManagerOrOwner) return undefined;
    fetchDayCollection(shift.id)
      .then((rows) => { if (!cancelled) setDayCollection(rows); })
      .catch(() => {});
    getShiftTemplateConfig(shift.organization_id, shift.store_id)
      .then((cfg) => { if (!cancelled) setCollectionMode((cfg as any)?.collection_summary_mode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shift?.id, shift?.organization_id, shift?.store_id, isManagerOrOwner]);

  // The day's last shift is the one nothing was opened after.
  const isLastOfDay =
    dayCollection.length === 0 ||
    dayCollection[dayCollection.length - 1]?.shift_id === shift?.id;
  const collection = collectionSummary(dayCollection);
  const showCollection =
    isManagerOrOwner && dayCollection.length > 0 &&
    shouldShowCollection({ mode: collectionMode, isLastOfDay });

  // Every hook above this line, so each render runs the same ones in the
  // same order - «Rendered more hooks than during the previous render» is
  // what it says when they do not. Everything that reads `shift` goes
  // below, because up here it may still be null.
  if (!isOpen || !shift) return null;

  const approvalDiscrepancy = safeNum(shift.discrepancy);
  const isShiftBalanced = Math.abs(approvalDiscrepancy) < 0.01;


  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await updateShiftInFirestore(shift.id, {
        status: 'APPROVED',
        manager_notes: managerNotes || 'Εγκρίθηκε από τον διευθυντή',
      });

      setShowApproveConfirm(false);
      setApproveSucceeded(true);
      onRefresh();
      setTimeout(() => onClose(), SUCCESS_MODAL_CLOSE_MS);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την έγκριση βάρδιας');
      setShowApproveConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerNotes) {
      setError('Παρακαλώ εισάγετε αιτιολογία για την αίτηση διόρθωσης.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextStatus = actionType === 'CORRECTION' ? 'CORRECTION_REQUESTED' : 'REOPENED';
      await updateShiftInFirestore(shift.id, {
        status: nextStatus,
        manager_notes: managerNotes,
        reopened_at: new Date().toISOString(),
      });

      setShowReopenModal(false);
      setReopenSucceededMsg(
        actionType === 'CORRECTION' ? 'Το αίτημα διόρθωσης στάλθηκε' : 'Η βάρδια ανοίχθηκε ξανά'
      );
      onRefresh();
      setTimeout(() => onClose(), SUCCESS_MODAL_CLOSE_MS);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την υποβολή αιτήματος διόρθωσης');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={Scale}
      title="Επιθεώρηση & Έγκριση Βάρδιας"
      badge={<ShiftStatusBadge status={shift.status} variant="glass" />}
      subtitle={
        <>
          {shift.store_name} ({shift.register_id}) • Υπεύθυνος: <span className="font-bold text-white">{shift.opened_by_user_name || 'Υπάλληλος'}</span>
        </>
      }
      size="5xl"
    >
      <div className="space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('RECONCILIATION')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeTab === 'RECONCILIATION'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Έλεγχος & Συμφωνία Ταμείου (Reconciliation)</span>
            </button>
            <button
              onClick={() => setActiveTab('SHEET')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeTab === 'SHEET'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Φύλλο Αναφοράς Βάρδιας (Ledger)</span>
            </button>
            <button
              onClick={() => setActiveTab('SUMMARY')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeTab === 'SUMMARY'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Έξοδα & Σημειώσεις</span>
            </button>
          </div>

          {activeTab === 'RECONCILIATION' && (() => {
            // Data Extractions & Calculations
            const opapSales = safeNum(shift.opap_gross_sales);
            const opapPayouts = safeNum(shift.opap_payouts);
            const opapNet = roundCurrency(shift.opap_net_sales !== undefined ? safeNum(shift.opap_net_sales) : opapSales - opapPayouts);

            const vltsIn = safeNum(shift.vlts_cash_in);
            const vltsOut = safeNum(shift.vlts_cash_out);
            const vltsNet = resolveVltNet(shift);

            const scratchSales = safeNum(shift.scratch_sales ?? shift.custom_field_values?.scratch_sales);
            const scratchPayouts = safeNum(shift.scratch_payouts ?? shift.custom_field_values?.scratch_payouts);
            const scratchNet = roundCurrency(scratchSales - scratchPayouts);

            const toraServices = safeNum(shift.custom_field_values?.tora_bill_payments_amount ?? shift.custom_field_values?.tora_services_amount);
            const toraPayouts = safeNum(shift.custom_field_values?.tora_payouts_amount);
            const toraDirectTotal = (shift as any).tora_direct_total ?? shift.custom_field_values?.tora_direct_total;
            const toraDirectNet = roundCurrency(toraDirectTotal !== undefined ? safeNum(toraDirectTotal) : toraServices - toraPayouts);

            const fnbSales = safeNum(shift.fnb_cash);
            const fnbCard = safeNum(shift.fnb_card);
            const fnbTotal = roundCurrency(fnbSales + fnbCard);

            const toraPosItems: Array<{ name: string; amount: string | number }> = shift.custom_field_values?.tora_pos_items || [];
            const toraPosTotal = toraPosItems.length > 0
              ? toraPosItems.reduce((acc, item) => acc + safeNum(item.amount), 0)
              : safeNum(shift.card_payments);

            const expectedCash = roundCurrency(safeNum(shift.expected_cash));

            // Right Column - Physical Count Extractions
            // These read opening_notes / opening_coins / opening_topup1 /
            // opening_topup2 - none of which is ever written. The notes and
            // coins are columns on the shift, and the top-ups are stored with
            // an underscore before the digit, so all four came back undefined
            // and the breakdown below showed zero against a non-zero total.
            const openingNotesAmount = safeNum(shift.opening_cash_notes);
            const openingCoinsAmount = safeNum(shift.opening_cash_coins);
            const openingTopUp1 = safeNum(shift.custom_field_values?.opening_topup_1);
            const openingTopUp2 = safeNum(shift.custom_field_values?.opening_topup_2);
            const openingCashTotal = roundCurrency(
              openingNotesAmount + openingCoinsAmount + openingTopUp1 + openingTopUp2 || safeNum(shift.opening_cash)
            );

            const denominations: Record<string, number> = shift.counted_denominations || shift.custom_field_values?.denominations || {};
            const banknotesAndCoins = calculateBanknotesAndCoins(denominations);

            const bankDeposits = safeNum(shift.custom_field_values?.bank_deposits ?? shift.custom_field_values?.safe_drops);
            const storePosItems: Array<{ name: string; amount: string | number }> = shift.custom_field_values?.store_pos_items || [];
            const totalStorePos = storePosItems.reduce((acc, item) => acc + safeNum(item.amount), 0);

            // Το POS έκλεισε πακέτο πριν κλείσει το μαγαζί (0051).
            //
            // The manager used to see one flat POS figure with no way to tell
            // where it came from - and under batch close it is not a reading
            // off a machine at all, it is an arithmetic. So the three terms
            // are shown separately.
            //
            // The χθεσινή ουρά is not stored on the shift: it was a lookup at
            // closing time. It is recovered here from the three figures that
            // ARE stored, which has the side benefit of being the exact number
            // the operator was shown rather than whatever the lookup would
            // answer today.
            const usedBatchClose =
              shift.pos_batch_total !== undefined && shift.pos_batch_total !== null;
            const posBatchReport = safeNum(shift.pos_batch_total);
            const posTailTonight = safeNum(shift.pos_after_close);
            const posTailCarried = carriedFromStored(
              posBatchReport,
              posTailTonight,
              shift.card_payments
            );
            const machineCash = Array.isArray(shift.vlt_machine_cash)
              ? shift.vlt_machine_cash
              : [];

            const expensesGpCashTotal = safeNum(shift.custom_field_values?.expenses_gp_cash ?? shift.expenses_paid_cash);
            const expensesFnbCashTotal = safeNum(shift.custom_field_values?.expenses_fnb_cash);
            const creditGrantedTotal = safeNum(shift.customer_credit_granted);
            const creditCollectedTotal = safeNum(shift.customer_credit_collected ?? shift.customer_returns);

            const countedDrawerCash = roundCurrency(safeNum(shift.counted_cash) || banknotesAndCoins.total);
            const grossCount = roundCurrency(
              banknotesAndCoins.banknotes +
              banknotesAndCoins.coins +
              bankDeposits +
              totalStorePos +
              expensesGpCashTotal +
              expensesFnbCashTotal +
              creditGrantedTotal -
              creditCollectedTotal
            );

            // total_reconciliation_count is the old name for this value, kept
            // as a fallback so a shift saved before migration 0021 still reads
            // correctly. It never held a count - see calculateReconciliationNetTotal.
            const storedNetTotal =
              shift.custom_field_values?.reconciliation_net_total ??
              shift.custom_field_values?.total_reconciliation_count;
            const reconciliationNetTotal = roundCurrency(
              storedNetTotal !== undefined ? safeNum(storedNetTotal) : grossCount - openingCashTotal
            );

            const discrepancy = roundCurrency(
              shift.discrepancy !== undefined
                ? safeNum(shift.discrepancy)
                : reconciliationNetTotal - expectedCash
            );
            const isBalanced = Math.abs(discrepancy) < 0.01;

            return (
              <div className="space-y-4">
                {/* Status & Discrepancy Hero Card */}
                <div
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                    isBalanced
                      ? 'bg-emerald-950 text-white border-emerald-800'
                      : discrepancy > 0
                      ? 'bg-indigo-950 text-white border-indigo-800'
                      : 'bg-rose-950 text-white border-rose-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isBalanced
                          ? 'bg-emerald-600 text-white'
                          : discrepancy > 0
                          ? 'bg-indigo-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {isBalanced ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Οικονομικό Ισοζύγιο Ταμείου
                      </span>
                      <h3 className="text-lg font-black tracking-tight">
                        {isBalanced
                          ? 'Ταμείο Πλήρως Ισοσκελισμένο'
                          : discrepancy > 0
                          ? `Πλεόνασμα Ταμείου (${formatCurrency(discrepancy, { showSign: true })})`
                          : `Έλλειμμα Ταμείου (${formatCurrency(discrepancy)})`}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <span className="text-micro uppercase font-bold text-slate-300 block">Απόκλιση</span>
                      <span
                        className={`text-xl sm:text-2xl font-black font-mono ${
                          isBalanced
                            ? 'text-emerald-400'
                            : discrepancy > 0
                            ? 'text-indigo-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(discrepancy, { showSign: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2-COLUMN SIDE-BY-SIDE RECONCILIATION VIEW */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* LEFT COLUMN: 1. Αναφορές */}
                  <div className="bg-slate-900/90 text-white rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between shadow-xs">
                    {/* Header Banner */}
                    <div className="bg-blue-900/90 text-white text-center py-2.5 text-xs font-black uppercase tracking-wider border-b border-blue-800 shadow-xs flex items-center justify-center space-x-1.5">
                      <FileText className="w-4 h-4 text-blue-300" />
                      <span>1. Αναφορές (Εκκαθάριση Συστημάτων)</span>
                    </div>

                    <div className="p-3.5 space-y-3 text-sm">
                      {/* Block 1: Παιχνίδια ΟΠΑΠ */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Παιχνίδια
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Ακαθάριστα:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(opapSales)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πληρωμές:</span>
                          <span className="font-mono font-bold text-rose-300">-{formatCurrency(opapPayouts)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Καθαρά:</span>
                          <span className="font-mono text-emerald-400">{formatCurrency(opapNet)}</span>
                        </div>
                      </div>

                      {/* Block 2: VLTs (Play OPAP) */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          VLTs
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Cash In:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(vltsIn)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Cash Out:</span>
                          <span className="font-mono font-bold text-rose-300">-{formatCurrency(vltsOut)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Καθαρά:</span>
                          <span className="font-mono text-emerald-400">{formatCurrency(vltsNet)}</span>
                        </div>
                      </div>

                      {/* Block 3: Λαχεία & Σκρατς */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Λαχεία & Σκρατς
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πωλήσεις:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(scratchSales)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πληρωμές:</span>
                          <span className="font-mono font-bold text-rose-300">-{formatCurrency(scratchPayouts)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Καθαρά:</span>
                          <span className="font-mono text-emerald-400">{formatCurrency(scratchNet)}</span>
                        </div>
                      </div>

                      {/* Block 4: Tora Direct */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Tora Direct
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Υπηρεσίες:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(toraServices)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πληρωμές:</span>
                          <span className="font-mono font-bold text-rose-300">-{formatCurrency(toraPayouts)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Καθαρά:</span>
                          <span className="font-mono text-emerald-400">{formatCurrency(toraDirectNet)}</span>
                        </div>
                      </div>

                      {/* Block 5: FnB */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          FnB
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πωλήσεις:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(fnbTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Κάρτες:</span>
                          <span className="font-mono font-bold text-rose-300">-{formatCurrency(fnbCard)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Καθαρά:</span>
                          <span className="font-mono text-emerald-400">{formatCurrency(fnbSales)}</span>
                        </div>
                      </div>

                      {/* Block 6: POS Αφαιρέσεις */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          POS Αφαιρέσεις
                        </div>
                        {toraPosItems.length > 0 ? (
                          toraPosItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-slate-300 py-0.5">
                              <span>{item.name || `POS #${idx + 1}`}:</span>
                              <span className="font-mono font-bold text-rose-300">-{formatCurrency(safeNum(item.amount))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex justify-between text-slate-300 py-0.5">
                            <span>POS Πληρωμές:</span>
                            <span className="font-mono font-bold text-rose-300">-{formatCurrency(toraPosTotal)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Σύνολο Αφαιρέσεων:</span>
                          <span className="font-mono text-rose-300">-{formatCurrency(toraPosTotal)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Left Blue Bar */}
                    <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                      <span>Σύνολο Ταμείου (Αναφορές):</span>
                      <span className="font-mono text-base font-black text-emerald-300">{formatCurrency(expectedCash)}</span>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: 2. Καταμέτρηση */}
                  <div className="bg-slate-900/90 text-white rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between shadow-xs">
                    {/* Header Banner */}
                    <div className="bg-blue-900/90 text-white text-center py-2.5 text-xs font-black uppercase tracking-wider border-b border-blue-800 shadow-xs flex items-center justify-center space-x-1.5">
                      <Coins className="w-4 h-4 text-amber-300" />
                      <span>2. Καταμέτρηση (Φυσική Καταμέτρηση)</span>
                    </div>

                    <div className="p-3.5 space-y-3 text-sm">
                      {/* Block 1: Αρχικό κεφάλαιο */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Αρχικό κεφάλαιο
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Μετρητά:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(openingNotesAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Κέρματα:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(openingCoinsAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Προσαύξηση #1:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(openingTopUp1)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Προσαύξηση #2:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(openingTopUp2)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Σύνολο:</span>
                          <span className="font-mono text-white">{formatCurrency(openingCashTotal)}</span>
                        </div>
                      </div>

                      {/* Block 2: Κέρματα Ταμείου */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Κέρματα Ταμείου
                        </div>
                        {/* No height cap: the list is fixed at five
                            denominations, so a scrollbar can never reveal
                            anything new - it only hid what was there. */}
                        <div className="space-y-0.5 pr-1">
                          {[
                            { label: '2x', key: '2', val: 2 },
                            { label: '1x', key: '1', val: 1 },
                            { label: '0.5x', key: '0.50', altKey: '0.5', val: 0.5 },
                            { label: '0.2x', key: '0.20', altKey: '0.2', val: 0.2 },
                            { label: '0.1x', key: '0.10', altKey: '0.1', val: 0.1 },
                          ].map((c) => {
                            const rawQty =
                              denominations[c.key] ??
                              (c.altKey ? denominations[c.altKey] : undefined) ??
                              denominations[`eur_${c.key.replace('.', '')}`] ??
                              denominations[`eur_${c.key}`];
                            const qty = Math.floor(safeNum(rawQty));
                            const subtotal = roundCurrency(qty * c.val);
                            return (
                              <div key={c.key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60 text-sm">
                                <span className="font-mono text-slate-300 font-bold w-12">{c.label}</span>
                                <span className="font-mono text-slate-200 font-bold text-center flex-1">{qty} τμχ</span>
                                <span className="font-mono font-bold text-white w-20 text-right">{formatCurrency(subtotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Σύνολο:</span>
                          <span className="font-mono text-white">{formatCurrency(banknotesAndCoins.coins)}</span>
                        </div>
                      </div>

                      {/* Block 3: Μετρητά Ταμείου */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Μετρητά Ταμείου
                        </div>
                        {/* Seven notes, and the cap was 144px - so a
                            reconciliation cut off at 200x and somebody had
                            to scroll inside the panel to see whether a 500
                            had been counted. */}
                        <div className="space-y-0.5 pr-1">
                          {[
                            { label: '5x', key: '5', val: 5 },
                            { label: '10x', key: '10', val: 10 },
                            { label: '20x', key: '20', val: 20 },
                            { label: '50x', key: '50', val: 50 },
                            { label: '100x', key: '100', val: 100 },
                            { label: '200x', key: '200', val: 200 },
                            { label: '500x', key: '500', val: 500 },
                          ].map((n) => {
                            const rawQty =
                              denominations[n.key] ??
                              denominations[`eur_${n.key}`];
                            const qty = Math.floor(safeNum(rawQty));
                            const subtotal = roundCurrency(qty * n.val);
                            return (
                              <div key={n.key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60 text-sm">
                                <span className="font-mono text-slate-300 font-bold w-12">{n.label}</span>
                                <span className="font-mono text-slate-200 font-bold text-center flex-1">{qty} τμχ</span>
                                <span className="font-mono font-bold text-white w-20 text-right">{formatCurrency(subtotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Σύνολο:</span>
                          <span className="font-mono text-white">{formatCurrency(banknotesAndCoins.banknotes)}</span>
                        </div>
                      </div>

                      {/* Block 4: Ταμείο */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                          Ταμείο (Τελική Συμφωνία)
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Μετρητά Χαρτονομίσματα:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(banknotesAndCoins.banknotes)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Κέρματα:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(banknotesAndCoins.coins)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Χρηματοκιβώτιο:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(bankDeposits)}</span>
                        </div>
                        {/* Straight under it, this shift's own. A παράδοση
                            κερμάτων belongs to whoever made it and does not
                            carry, so the morning's and the evening's each
                            show against their own operator.

                            Shown even at zero, like every other line in this
                            reconciliation - «nothing was handed over» is an
                            answer, while a missing row leaves the reader
                            wondering whether it was zero or not recorded. It
                            was hidden at zero, which is why it was invisible
                            on every shift that had no cup. */}
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Παράδοση Κερμάτων:</span>
                          <span className="font-mono font-bold text-white">
                            {formatCurrency(safeNum(shift.coin_handover))}
                          </span>
                        </div>
                        {usedBatchClose ? (
                          <>
                            <div className="flex justify-between text-slate-400 py-0.5 text-micro">
                              <span>Αναφορά κλεισίματος πακέτου:</span>
                              <span className="font-mono">{formatCurrency(posBatchReport)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400 py-0.5 text-micro">
                              <span>Χθεσινή ουρά (αφαιρείται):</span>
                              <span className="font-mono text-rose-300">
                                -{formatCurrency(posTailCarried)}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-400 py-0.5 text-micro">
                              <span>Μετά το κλείσιμο, απόψε:</span>
                              <span className="font-mono text-emerald-300">
                                +{formatCurrency(posTailTonight)}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-300 py-0.5">
                              <span>Pos Καταστήματος:</span>
                              <span className="font-mono font-bold text-white">
                                {formatCurrency(safeNum(shift.card_payments))}
                              </span>
                            </div>
                          </>
                        ) : storePosItems.length > 0 ? (
                          storePosItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-slate-300 py-0.5">
                              <span>{item.name || `Pos #${idx + 1}`}:</span>
                              <span className="font-mono font-bold text-white">{formatCurrency(safeNum(item.amount))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex justify-between text-slate-300 py-0.5">
                            <span>Pos Καταστήματος:</span>
                            <span className="font-mono font-bold text-white">{formatCurrency(totalStorePos)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Έξοδα ΓΠ:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(expensesGpCashTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Έξοδα FnB:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(expensesFnbCashTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Πιστώσεις:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(creditGrantedTotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 py-0.5">
                          <span>Επιστροφές:</span>
                          <span className="font-mono font-bold text-rose-300">{creditCollectedTotal > 0 ? '-' + formatCurrency(creditCollectedTotal) : formatCurrency(0)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-800 pt-1">
                          <span>Σύνολο:</span>
                          <span className="font-mono text-white">{formatCurrency(grossCount)}</span>
                        </div>
                      </div>

                      {/* Μετρητά μέσα στα μηχανήματα (0051). Its own block,
                          deliberately below the Σύνολο: this money is inside
                          the machines and is not part of anything above it.
                          Folding it into the reconciliation would read as
                          cash the shift is answerable for. */}
                      {machineCash.length > 0 && (
                        <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                          <div className="text-center font-black text-slate-400 border-b border-slate-800 pb-1 text-micro uppercase tracking-wider">
                            Μετρητά στα VLTs — εκτός ισοζυγίου
                          </div>
                          {machineCash.map((reading, idx) => (
                            <div key={idx} className="flex justify-between text-slate-300 py-0.5">
                              <span>{reading.label || `ILink #${idx + 1}`}:</span>
                              <span className="font-mono font-bold text-white">
                                {formatCurrency(safeNum(reading.amount))}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between text-slate-400 font-bold border-t border-slate-800 pt-1">
                            <span>Σύνολο:</span>
                            <span className="font-mono text-slate-200">
                              {formatCurrency(
                                machineCash.reduce((t, r) => t + safeNum(r.amount), 0)
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Right Blue Bar */}
                    <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                      <span>Σύνολο Καταμέτρησης:</span>
                      <span className="font-mono text-base font-black text-emerald-300">{formatCurrency(reconciliationNetTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Scratch Ticket Granular Verification Table for Managers */}
                {(() => {
                  const scratchItems: ScratchTicketRow[] = shift.custom_field_values?.scratch_ticket_items || [];
                  const activeItems = scratchItems.filter(
                    (r) =>
                      (r.startNo && r.startNo !== '') ||
                      (r.endNo && r.endNo !== '') ||
                      (r.backStartNo && r.backStartNo !== '') ||
                      calculateCombinedRowQty(r) > 0
                  );
                  if (activeItems.length === 0) return null;

                  const scratchPieces = activeItems.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
                  // calculateCombinedRowQty (not calculateRowQty) - a Λαχεία row can
                  // opt into Πίσω selling too (hasBackSide), so front-only would undercount.
                  const lotteryPieces = activeItems.filter((r) => isLotteryRow(r)).reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
                  const totalVal = activeItems.reduce((acc, r) => acc + calculateRowTotal(r), 0);
                  const totalSold = scratchPieces + lotteryPieces;

                  return (
                    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                            Έλεγχος Σκρατς & Λαχείων Βάρδιας (Καταμέτρηση Τεμαχίων)
                          </h3>
                        </div>
                        <span className="text-micro font-mono font-bold text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                          {totalSold} τμχ • {formatCurrency(totalVal)}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse font-mono">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-800 text-micro uppercase">
                              <th className="py-1.5 px-2">Παιχνίδι</th>
                              <th className="py-1.5 px-2 text-right">Τιμή</th>
                              <th className="py-1.5 px-2 text-center text-indigo-400">Μπρ. Αρχικό</th>
                              <th className="py-1.5 px-2 text-center text-indigo-400">Μπρ. Τελικό</th>
                              <th className="py-1.5 px-2 text-center text-purple-400">Πίσ. Αρχικό</th>
                              <th className="py-1.5 px-2 text-center text-purple-400">Πίσ. Τελικό</th>
                              <th className="py-1.5 px-2 text-center">Σύνολο (Τμχ)</th>
                              <th className="py-1.5 px-2 text-right">Αξία (€)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-medium">
                            {activeItems.map((r, idx) => {
                              const qty = calculateCombinedRowQty(r);
                              const val = calculateRowTotal(r);
                              const isManual = getCountingMode(r) === 'manual';
                              const bundleTracked = isBundleTrackedRow(r);
                              const bundleSize = r.bundleSize || 5;
                              const startSplit = bundleTracked ? splitPiecesIntoBundles(parseNonNegativeInt(r.startNo).value, bundleSize) : null;
                              const endSplit = bundleTracked && r.endNo ? splitPiecesIntoBundles(parseNonNegativeInt(r.endNo).value, bundleSize) : null;
                              return (
                                <tr key={r.id || idx} className="hover:bg-slate-800/40">
                                  <td className="py-1.5 px-2 font-sans font-bold text-slate-200">
                                    {r.name}
                                    {r.isNewPack && (
                                      <span className="ml-2 text-micro bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded">
                                        Νέο
                                      </span>
                                    )}
                                    {/* Αδιάθετοι. The one figure that says a
                                        draw was written off rather than sold,
                                        so it has to be readable here or
                                        nobody can check it against what went
                                        back. */}
                                    {safeNum(r.cancelledBundles) > 0 && (
                                      <span className="ml-2 text-micro bg-slate-800 text-slate-300 border border-slate-600 px-1.5 py-0.2 rounded font-mono">
                                        {safeNum(r.cancelledBundles)} πεντ. αδιάθετες
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-right text-slate-300">{formatCurrency(Number(r.price))}</td>
                                  <td className="py-1.5 px-2 text-center text-amber-300 font-bold">
                                    {isManual ? (
                                      <span className="text-slate-500">—</span>
                                    ) : (
                                      <>
                                        {r.startNo || '-'}
                                        {startSplit && (
                                          <div className="text-micro font-sans font-normal text-amber-500/80 normal-case">
                                            {startSplit.bundles} πεντ. + {startSplit.pieces} τμχ
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center text-indigo-300 font-bold">
                                    {isManual ? (
                                      r.manualQty || '-'
                                    ) : (
                                      <>
                                        {r.endNo || '-'}
                                        {endSplit && (
                                          <div className="text-micro font-sans font-normal text-indigo-400/80 normal-case">
                                            {endSplit.bundles} πεντ. + {endSplit.pieces} τμχ
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center text-slate-300 font-bold">{!hasBackSide(r) ? '—' : (r.backStartNo || '-')}</td>
                                  <td className="py-1.5 px-2 text-center text-amber-300 font-bold">{!hasBackSide(r) ? '—' : (r.backEndNo || '-')}</td>
                                  <td className="py-1.5 px-2 text-center font-bold text-white">
                                    <span className={qty > 0 ? 'bg-indigo-900/80 px-2 py-0.5 rounded text-indigo-200' : 'text-slate-500'}>
                                      {qty}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-black text-emerald-400">
                                    {formatCurrency(val)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* Customer Credits & Credit Score Verification Table */}
                {(() => {
                  /**
                   * Ποιον χρέωσε η βάρδια και πόσο.
                   *
                   * This read `shift.customer_credits` - a field on the Shift
                   * type with no column behind it, exactly like
                   * `shift.expenses` before it. Always undefined, so the
                   * whole panel returned null and has never appeared on any
                   * shift: the inspector could see that 85 € of credit had
                   * been given and never to whom.
                   */
                  const creditsList = creditLinesFor(
                    postedCredits,
                    shift.custom_field_values?.customer_credits
                  );
                  if (creditsList.length === 0) return null;
                  const creditTotals = creditLineTotals(creditsList);
                  const perCustomer = byCustomer(creditsList);

                  return (
                    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                          <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                            Πιστώσεις & Εισπράξεις Πελατών Βάρδιας (Τεφτέρι)
                          </h3>
                        </div>
                        <span className="text-micro font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2.5 py-0.5 rounded-md border border-indigo-800/60">
                          {creditsList.length} κινήσεις
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-800 text-micro uppercase font-mono">
                              <th className="py-1.5 px-2">Πελάτης</th>
                              <th className="py-1.5 px-2 text-center">Credit Score</th>
                              <th className="py-1.5 px-2 text-center">Τύπος Κίνησης</th>
                              <th className="py-1.5 px-2">Σημειώσεις</th>
                              <th className="py-1.5 px-2 text-right">Ποσό (€)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-medium">
                            {creditsList.map((cred, idx) => {
                              const isCollected = cred.type === 'COLLECTED';
                              return (
                                <tr key={cred.id || idx} className="hover:bg-slate-800/40">
                                  <td className="py-1.5 px-2 font-bold text-slate-200">
                                    {cred.customerName}
                                    {cred.at && (
                                      <span className="block text-micro font-mono font-normal text-slate-500">
                                        {new Date(cred.at).toLocaleString('el-GR', {
                                          timeZone: 'Europe/Athens',
                                          day: '2-digit',
                                          month: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: false,
                                        })}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-micro font-black font-mono ${
                                        cred.tier === 'A+'
                                          ? 'bg-purple-900/80 text-purple-300 border border-purple-700'
                                          : cred.tier === 'A'
                                          ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
                                          : cred.tier === 'B' || !cred.tier
                                          ? 'bg-amber-900/80 text-amber-300 border border-amber-700'
                                          : 'bg-rose-900/80 text-rose-300 border border-rose-700'
                                      }`}
                                    >
                                      {cred.tier || 'B'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded text-micro font-bold ${
                                        isCollected
                                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                                      }`}
                                    >
                                      {isCollected ? 'Είσπραξη / Εξόφληση' : 'Νέα Πίστωση (Χρέωση)'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-500 text-micro italic">
                                    {cred.notes || '-'}
                                  </td>
                                  <td
                                    className={`py-1.5 px-2 text-right font-mono font-black ${
                                      isCollected ? 'text-emerald-400' : 'text-amber-400'
                                    }`}
                                  >
                                    {isCollected ? '-' : '+'}
                                    {formatCurrency(cred.amount)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* «Πόσο χρέωσε τον κάθε πελάτη» - the question the
                          panel existed to answer and could not, because a
                          list of movements is not the same as a position
                          once somebody both took credit and paid some back
                          in the same shift. */}
                      <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-micro font-black uppercase tracking-wider text-slate-400">
                            Ανά πελάτη
                          </span>
                          <span className="text-micro font-mono text-slate-400">
                            {creditTotals.customers}{' '}
                            {creditTotals.customers === 1 ? 'πελάτης' : 'πελάτες'}
                          </span>
                        </div>
                        {perCustomer.map((c) => (
                          <div
                            key={c.customerName}
                            className="flex items-center justify-between text-xs gap-2"
                          >
                            <span className="text-slate-300 truncate">
                              {c.customerName}
                              {c.lines > 1 && (
                                <span className="text-micro text-slate-500 font-mono">
                                  {' '}
                                  ({c.granted > 0 && `+${formatCurrency(c.granted)}`}
                                  {c.granted > 0 && c.collected > 0 && ' '}
                                  {c.collected > 0 && `-${formatCurrency(c.collected)}`})
                                </span>
                              )}
                            </span>
                            <span
                              className={`font-mono font-black shrink-0 ${
                                c.net > 0 ? 'text-amber-300' : c.net < 0 ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              {formatCurrency(c.net, { showSign: true })}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-slate-800 pt-1.5 text-xs">
                          <span className="font-bold text-slate-300">Καθαρή χρέωση βάρδιας</span>
                          <span className="font-mono font-black text-white">
                            {formatCurrency(creditTotals.net, { showSign: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Employee / Manager Notes Preview */}
                {(shift.employee_notes || shift.manager_notes || shift.handover_message) && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm">
                    {shift.employee_notes && (
                      <div>
                        <span className="font-bold text-slate-700 block">Σημειώσεις Υπαλλήλου:</span>
                        <p className="text-slate-600 italic">{shift.employee_notes}</p>
                      </div>
                    )}
                    {shift.handover_message && (
                      <div className={shift.employee_notes ? 'pt-2 border-t border-slate-200' : undefined}>
                        <span className="font-bold text-slate-700 block">Μήνυμα για την επόμενη βάρδια:</span>
                        <p className="text-slate-800 whitespace-pre-wrap">{shift.handover_message}</p>
                        {isManagerOrOwner && <HandoverReceipts shiftId={shift.id} />}
                      </div>
                    )}
                    {shift.manager_notes && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="font-bold text-indigo-700 block">
                          Σημειώσεις / Οδηγίες Διευθυντή:
                        </span>
                        <p className="text-slate-800 font-medium">{shift.manager_notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'SHEET' && (
            <ShiftLedgerSheet shift={shift} readOnly={true} />
          )}

          {activeTab === 'SUMMARY' && (
            <>
              {/* User Timestamps Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 font-bold uppercase block mb-1">Έναρξη</span>
                  <p className="font-bold text-slate-900">{shift.opened_by_user_name || 'Υπάλληλος'}</p>
                  <p className="text-slate-500 font-mono">
                    {new Date(shift.opened_at).toLocaleString('el-GR')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase block mb-1">Κλείσιμο</span>
                  <p className="font-bold text-slate-900">
                    {shift.closed_by_user_name || (shift.closed_at ? 'Υπάλληλος' : '-')}
                  </p>
                  <p className="text-slate-500 font-mono">
                    {shift.closed_at ? new Date(shift.closed_at).toLocaleString('el-GR') : 'Σε εξέλιξη'}
                  </p>
                </div>
              </div>

              {/* What somebody has to physically pick up, across the whole
                  day. Three separate piles - the envelope is notes above the
                  float, a safe drop is already in the safe, a cup of coins
                  travels beside the envelope - and whoever walked in to
                  collect was adding them up in their head. */}
              {showCollection && (
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider">
                      Προς Παραλαβή — Σύνολο Ημέρας
                    </h3>
                    <span className="text-lg font-black font-mono text-indigo-900">
                      {formatCurrency(collection.total)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Φάκελοι', collection.envelopes],
                      ['Χρηματοκιβώτιο', collection.safeDrops],
                      ['Κέρματα', collection.coins],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-white rounded-lg border border-indigo-200 py-1.5">
                        <span className="block text-micro font-bold text-slate-600">{label}</span>
                        <span className="block font-mono font-black text-slate-900 text-xs">
                          {formatCurrency(Number(value))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Per shift, so a figure can be traced to whoever counted
                      it rather than arriving as one number to be trusted. */}
                  {collection.lines.length > 1 && (
                    <div className="space-y-0.5 pt-1 border-t border-indigo-200">
                      {collection.lines.map((l) => (
                        <div key={l.shiftId} className="flex items-center justify-between text-micro">
                          <span className="text-indigo-900">{l.label}</span>
                          <span className="font-mono font-bold text-indigo-900">
                            {formatCurrency(l.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Expenses & Receipts.
              
                  These used to be read from `shift.expenses`, a field left
                  over from when a shift document carried its own expenses.
                  Nothing has populated it since they moved to a table of
                  their own, so this panel said «δεν υπάρχουν καταχωρημένα
                  έξοδα» on every shift ever opened - including one with two
                  rows against it. */}
              {shiftExpenses.length > 0 ? (
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Receipt className="w-4 h-4 text-indigo-600" />
                    <span>Έξοδα Βάρδιας ({ownExpenses.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {shiftExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">
                            {exp.recipient || exp.notes || 'Έξοδο'}
                          </span>
                          <span className="text-slate-500 ml-2">({exp.category})</span>
                          {/* Which shift of the day it belongs to. The
                              reconciliation counts the whole day's, so a
                              manager reading this should see which ones this
                              operator entered and which they inherited. */}
                          {isCarriedExpense(exp, shift.id, shift.opened_at) && (
                            <span className="ml-2 text-micro font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-full">
                              άλλη βάρδια της ημέρας
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="font-bold text-slate-900">{formatCurrency(exp.amount)}</span>
                          {exp.receipt_url && (
                            <button
                              onClick={() => setSelectedReceiptUrl(exp.receipt_url || null)}
                              className="px-2 py-1 bg-white border border-slate-200 rounded text-indigo-600 font-bold hover:bg-indigo-50 flex items-center space-x-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Απόδειξη</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-1.5">
                  <Receipt className="w-6 h-6 mx-auto text-slate-300" />
                  <p>Δεν υπάρχουν καταχωρημένα έξοδα για αυτή τη βάρδια.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Κλείσιμο
          </button>

          <div className="flex items-center space-x-2">
            {/* Print Receipt Button */}
            <button
              onClick={() => setShowReceiptModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4 text-indigo-300" />
              <span>Εκτύπωση Απόδειξης</span>
            </button>

            {/* If shift is CORRECTION_REQUESTED or REOPENED, employee can edit */}
            {(shift.status === 'CORRECTION_REQUESTED' || shift.status === 'REOPENED') &&
              onOpenClosingWizard && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenClosingWizard(shift);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Άνοιγμα Οδηγού Διόρθωσης</span>
                </button>
              )}

            {/* Delete Draft Button for Owner / Manager */}
            {isManagerOrOwner && ['DRAFT_CLOSING', 'OPEN', 'CORRECTION_REQUESTED', 'REOPENED'].includes(shift.status) && onDeleteRequest && (
              <button
                onClick={() => onDeleteRequest(shift)}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center space-x-1.5 transition-colors border border-rose-200 cursor-pointer"
                title="Διαγραφή Προχείρου Βάρδιας"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Διαγραφή Προχείρου</span>
              </button>
            )}

            {/* Manager Actions */}
            {['SUBMITTED', 'APPROVED'].includes(shift.status) && canReopen && (
              <button
                onClick={() => setShowReopenModal(true)}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Αίτηση Διόρθωσης</span>
              </button>
            )}

            {shift.status === 'SUBMITTED' && canApprove && (
              <button
                onClick={() => setShowApproveConfirm(true)}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center space-x-2 shadow-md cursor-pointer transition-all active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Έγκριση Βάρδιας</span>
              </button>
            )}
          </div>
      </div>
    </Modal>

      {/* Reopen / Request Correction Sub-modal */}
      <Modal
        isOpen={showReopenModal}
        onClose={() => setShowReopenModal(false)}
        layer="stacked"
        icon={ShieldAlert}
        iconClassName="text-rose-400"
        title="Αίτηση Διόρθωσης Βάρδιας"
        size="sm"
        bodyAsForm
        onSubmit={handleReopenSubmit}
        footer={
          <ModalActions
            onCancel={() => setShowReopenModal(false)}
            saveLabel="Επιβεβαίωση Αίτησης"
            saveTone="destructive"
            isSaving={loading}
            savingLabel="Αποστολή..."
          />
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Εισάγετε την αιτιολογία για την οποία ζητάτε από τον υπάλληλο να διορθώσει τη βάρδια.
          </p>

          <div>
            <label htmlFor="reopen-action-type" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Ενέργεια
            </label>
            <select
              id="reopen-action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
            >
              <option value="CORRECTION">Αίτηση Διόρθωσης (Correction Requested)</option>
              <option value="REOPEN">Πλήρες Επανάννοιγμα Βάρδιας (Reopened)</option>
            </select>
          </div>

          <div>
            <label htmlFor="reopen-notes" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Αιτιολογία & Οδηγίες <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="reopen-notes"
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              placeholder="Π.χ. Παρακαλώ επανακαταμετρήστε τα πληρωθέντα δελτία ΟΠΑΠ..."
              rows={3}
              maxLength={MAX_NOTES_LENGTH}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
              required
            />
          </div>
        </div>
      </Modal>

      {/* Approve Confirmation Modal */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onCancel={() => setShowApproveConfirm(false)}
        onConfirm={handleApprove}
        tone="positive"
        layer="stacked"
        title="Έγκριση Βάρδιας"
        isLoading={loading}
        loadingLabel="Έγκριση..."
        confirmLabel="Ναι, Έγκριση"
        message={
          <div className="space-y-3">
            <span className="text-micro font-bold text-slate-500 uppercase tracking-wider block">
              {shift.store_name} • {shift.register_id}
            </span>

            {!isShiftBalanced ? (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-950">
                <p className="font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Αυτή η βάρδια έχει απόκλιση ταμείου</span>
                </p>
                <p>
                  Διαφορά: <strong>{formatCurrency(approvalDiscrepancy, { showSign: true })}</strong>. Επιβεβαιώστε ότι
                  θέλετε να εγκρίνετε τη βάρδια παρά την απόκλιση.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
                Η βάρδια είναι ισοσκελισμένη. Μετά την έγκριση, η βάρδια οριστικοποιείται.
              </div>
            )}

            {error && (
              <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 text-xs font-semibold text-rose-800">
                {error}
              </div>
            )}
          </div>
        }
      />

      {/* Brief success confirmation before closing */}
      <Modal
        isOpen={approveSucceeded}
        onClose={() => setApproveSucceeded(false)}
        layer="stacked"
        headerStyle="none"
        size="sm"
        closeOnBackdropClick
      >
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="font-extrabold text-slate-900">Η βάρδια εγκρίθηκε</p>
        </div>
      </Modal>

      <Modal
        isOpen={!!reopenSucceededMsg}
        onClose={() => setReopenSucceededMsg(null)}
        layer="stacked"
        headerStyle="none"
        size="sm"
        closeOnBackdropClick
      >
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="font-extrabold text-slate-900">{reopenSucceededMsg}</p>
        </div>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        isOpen={!!selectedReceiptUrl}
        onClose={() => setSelectedReceiptUrl(null)}
        layer="stacked"
        headerStyle="bordered"
        title="Προεπισκόπηση Απόδειξης"
        size="lg"
        closeOnBackdropClick
      >
        <img
          src={selectedReceiptUrl || ''}
          alt="Receipt Preview"
          className="w-full max-h-[70vh] object-contain rounded-lg border border-slate-200"
        />
      </Modal>

      {/* Print Thermal Receipt Modal */}
      <ShiftReceiptPrintView
        data={{
          shift: shift,
          storeName: shift.store_name || 'OPAP AGENCY',
          storeCode: shift.store_code || shift.store_id || '100343',
          registerId: shift.register_id || 'POS-01',
          cashierName: shift.closed_by_user_name || shift.opened_by_user_name || 'Υπάλληλος Βάρδιας',
          shiftType: shift.shift_type || 'MORNING',
          openedAt: shift.opened_at,
          closedAt: shift.closed_at || new Date().toISOString(),
          denominations: shift.counted_denominations || {},
          openingCashTotal: safeNum(shift.opening_cash),
          arithmoGross: safeNum(shift.arithmo_gross ?? shift.number_games_sales),
          arithmoCancels: safeNum(shift.arithmo_cancels ?? shift.number_games_cancellations),
          arithmoPayouts: safeNum(shift.arithmo_payouts ?? shift.number_games_payouts),
          arithmoVouchers: safeNum(shift.arithmo_vouchers ?? shift.number_games_vouchers),
          arithmoNet: safeNum((shift as any).arithmo_net ?? (safeNum(shift.arithmo_gross) - safeNum(shift.arithmo_cancels) - safeNum(shift.arithmo_payouts) + safeNum(shift.arithmo_vouchers))),
          scratchSales: safeNum(shift.scratch_sales ?? shift.scratch_lotto_sales),
          scratchPayouts: safeNum(shift.scratch_payouts),
          scratchNet: safeNum(shift.scratch_lotto_sales),
          vltsIn: safeNum(shift.vlts_cash_in),
          vltsOut: safeNum(shift.vlts_cash_out),
          vltsNet: safeNum((shift as any).vlts_net ?? (safeNum(shift.vlts_cash_in) - Math.abs(safeNum(shift.vlts_cash_out)))),
          pameStoiximaBalance: safeNum(shift.pame_stoixima_balance),
          cleverPointTotal: safeNum(shift.clever_point_total),
          ippodromosBalance: safeNum(shift.ippodromos_balance),
          fnbCash: safeNum(shift.fnb_cash),
          fnbCard: safeNum(shift.fnb_card),
          fnbTotal: safeNum(shift.fnb_sales),
          expensesGpCash: safeNum(shift.opap_expenses ?? (shift.expenses_paid_cash || 0)),
          expensesFnbCash: safeNum(shift.fnb_expenses),
          expensesTotalCash: safeNum(shift.expenses_paid_cash),
          expensesList: Array.isArray(shift.expenses) ? shift.expenses.map((e) => ({
            id: e.id,
            category: e.category,
            recipient: e.description || e.category,
            amount: safeNum(e.amount),
            notes: e.description,
          })) : [],
          safeDrop: safeNum(shift.bank_deposits ?? shift.safe_drop),
          coinHandover: safeNum(shift.coin_handover),
          storePos1: safeNum(shift.register_pos_1),
          storePos2: safeNum(shift.register_pos_2),
          totalStorePos: safeNum(shift.card_payments),
          toraPos1: safeNum(shift.tora_pos1 ?? shift.tora_pos_1),
          toraPos2: safeNum(shift.tora_pos2 ?? shift.tora_pos_2),
          totalToraPos: safeNum((shift as any).tora_total ?? (safeNum(shift.tora_pos1) + safeNum(shift.tora_pos2))),
          creditGranted: safeNum(shift.customer_credit_granted),
          creditCollected: safeNum(shift.customer_credit_collected ?? shift.customer_returns),
          totalCountedCash: safeNum(shift.counted_cash ?? shift.actual_cash),
          totalExpectedCash: safeNum(shift.expected_cash),
          discrepancy: safeNum(shift.discrepancy),
          isUnbalanced: shift.is_unbalanced ?? (Math.abs(safeNum(shift.discrepancy)) > 0.01),
          employeeNotes: shift.employee_notes,
          managerNotes: shift.manager_notes,
        }}
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
      />
    </>
  );
};
