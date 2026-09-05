import React, { useState } from 'react';
import {
  X,
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
import { formatCurrency } from '../../lib/formatters.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';
import { ShiftLedgerSheet } from './ShiftLedgerSheet.tsx';
import { ShiftReceiptPrintView, ShiftReceiptData } from './ShiftReceiptPrintView.tsx';
import {
  safeNum,
  roundCurrency,
  calculateBanknotesAndCoins,
  EUR_DENOMINATIONS,
} from '../../services/financialCalculator.ts';
import {
  calculateRowQty,
  calculateRowTotal,
  calculateCombinedRowQty,
  isLotteryRow,
  isBundleTrackedRow,
  parseNonNegativeInt,
  splitPiecesIntoBundles,
  ScratchTicketRow,
} from './ScratchCalculatorTable.tsx';

// Same 5 statuses/colors as ShiftsManager's renderStatusBadge, adapted to
// this modal's dark header (semi-transparent /20 fill + light text, vs.
// ShiftsManager's light bg-COLOR-50 on a white row) - was previously a
// 3-way ternary that collapsed OPEN and DRAFT_CLOSING into the same amber
// fallback, and put SUBMITTED under indigo instead of amber.
const SHIFT_STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  APPROVED: { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', label: 'ΕΓΚΕΚΡΙΜΕΝΗ' },
  SUBMITTED: { badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', label: 'ΕΚΚΡΕΜΕΙ ΕΓΚΡΙΣΗ' },
  CORRECTION_REQUESTED: { badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/30', label: 'ΑΙΤΗΣΗ ΔΙΟΡΘΩΣΗΣ' },
  OPEN: { badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', label: 'ΑΝΟΙΧΤΗ' },
  DRAFT_CLOSING: { badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30', label: 'ΠΡΟΧΕΙΡΟ' },
};

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

  if (!isOpen || !shift) return null;

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

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await updateShiftInFirestore(shift.id, {
        status: 'APPROVED',
        manager_notes: managerNotes || 'Εγκρίθηκε από τον διευθυντή',
      });

      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message);
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
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-100 my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="font-black text-base sm:text-lg">Επιθεώρηση & Έγκριση Βάρδιας</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    (SHIFT_STATUS_STYLES[shift.status] ?? { badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30' }).badge
                  }`}
                >
                  {(SHIFT_STATUS_STYLES[shift.status] ?? { label: shift.status }).label}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {shift.store_name} ({shift.register_id}) • Υπεύθυνος: <span className="font-bold text-white">{shift.opened_by_user_name || 'Υπάλληλος'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('RECONCILIATION')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
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
            const vltsNet = roundCurrency(shift.vlts_net !== undefined ? safeNum(shift.vlts_net) : vltsIn - vltsOut);

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
            const openingNotesAmount = safeNum(shift.custom_field_values?.opening_notes);
            const openingCoinsAmount = safeNum(shift.custom_field_values?.opening_coins);
            const openingTopUp1 = safeNum(shift.custom_field_values?.opening_topup1);
            const openingTopUp2 = safeNum(shift.custom_field_values?.opening_topup2);
            const openingCashTotal = roundCurrency(
              openingNotesAmount + openingCoinsAmount + openingTopUp1 + openingTopUp2 || safeNum(shift.opening_cash)
            );

            const denominations: Record<string, number> = shift.counted_denominations || shift.custom_field_values?.denominations || {};
            const banknotesAndCoins = calculateBanknotesAndCoins(denominations);

            const bankDeposits = safeNum(shift.custom_field_values?.bank_deposits ?? shift.custom_field_values?.safe_drops);
            const storePosItems: Array<{ name: string; amount: string | number }> = shift.custom_field_values?.store_pos_items || [];
            const totalStorePos = storePosItems.reduce((acc, item) => acc + safeNum(item.amount), 0);

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

            const totalReconciliationCount = roundCurrency(
              shift.custom_field_values?.total_reconciliation_count !== undefined
                ? safeNum(shift.custom_field_values.total_reconciliation_count)
                : grossCount - openingCashTotal
            );

            const discrepancy = roundCurrency(
              shift.discrepancy !== undefined
                ? safeNum(shift.discrepancy)
                : totalReconciliationCount - expectedCash
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
                      <h4 className="text-lg font-black tracking-tight">
                        {isBalanced
                          ? 'Ταμείο Πλήρως Ισοσκελισμένο'
                          : discrepancy > 0
                          ? `Πλεόνασμα Ταμείου (${formatCurrency(discrepancy, { showSign: true })})`
                          : `Έλλειμμα Ταμείου (${formatCurrency(discrepancy)})`}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-300 block">Απόκλιση</span>
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

                    <div className="p-3.5 space-y-3 text-xs">
                      {/* Block 1: Παιχνίδια ΟΠΑΠ */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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

                    <div className="p-3.5 space-y-3 text-xs">
                      {/* Block 1: Αρχικό κεφάλαιο */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-1">
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
                          Κέρματα Ταμείου
                        </div>
                        <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
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
                              <div key={c.key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60 text-xs">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
                          Μετρητά Ταμείου
                        </div>
                        <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
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
                              <div key={n.key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60 text-xs">
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
                        <div className="text-center font-black text-indigo-300 border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
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
                        {storePosItems.length > 0 ? (
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
                    </div>

                    {/* Bottom Right Blue Bar */}
                    <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                      <span>Σύνολο Καταμέτρησης:</span>
                      <span className="font-mono text-base font-black text-emerald-300">{formatCurrency(totalReconciliationCount)}</span>
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
                          <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                            Έλεγχος Σκρατς & Λαχείων Βάρδιας (Καταμέτρηση Τεμαχίων)
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                          {totalSold} τμχ • {formatCurrency(totalVal)}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
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
                              const lottery = isLotteryRow(r);
                              const bundleTracked = isBundleTrackedRow(r);
                              const bundleSize = r.bundleSize || 5;
                              const startSplit = bundleTracked ? splitPiecesIntoBundles(parseNonNegativeInt(r.startNo).value, bundleSize) : null;
                              const endSplit = bundleTracked && r.endNo ? splitPiecesIntoBundles(parseNonNegativeInt(r.endNo).value, bundleSize) : null;
                              return (
                                <tr key={r.id || idx} className="hover:bg-slate-800/40">
                                  <td className="py-1.5 px-2 font-sans font-bold text-slate-200">
                                    {r.name}
                                    {r.isNewPack && (
                                      <span className="ml-2 text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded">
                                        Νέο
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-right text-slate-300">{formatCurrency(Number(r.price))}</td>
                                  <td className="py-1.5 px-2 text-center text-amber-300 font-bold">
                                    {r.startNo || '-'}
                                    {startSplit && (
                                      <div className="text-[9px] font-sans font-normal text-amber-500/80 normal-case">
                                        {startSplit.bundles} πεντ. + {startSplit.pieces} τμχ
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center text-indigo-300 font-bold">
                                    {r.endNo || '-'}
                                    {endSplit && (
                                      <div className="text-[9px] font-sans font-normal text-indigo-400/80 normal-case">
                                        {endSplit.bundles} πεντ. + {endSplit.pieces} τμχ
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-center text-slate-300 font-bold">{lottery ? '—' : (r.backStartNo || '-')}</td>
                                  <td className="py-1.5 px-2 text-center text-amber-300 font-bold">{lottery ? '—' : (r.backEndNo || '-')}</td>
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
                  const creditsList = shift.customer_credits || [];
                  if (!Array.isArray(creditsList) || creditsList.length === 0) return null;

                  return (
                    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                          <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                            Πιστώσεις & Εισπράξεις Πελατών Βάρδιας (Τεφτέρι)
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2.5 py-0.5 rounded-md border border-indigo-800/60">
                          {creditsList.length} κινήσεις
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase font-mono">
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
                                    {cred.customer_name || 'Πελάτης'}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono ${
                                        cred.customer_tier === 'A+'
                                          ? 'bg-purple-900/80 text-purple-300 border border-purple-700'
                                          : cred.customer_tier === 'A'
                                          ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
                                          : cred.customer_tier === 'B'
                                          ? 'bg-amber-900/80 text-amber-300 border border-amber-700'
                                          : 'bg-rose-900/80 text-rose-300 border border-rose-700'
                                      }`}
                                    >
                                      {cred.customer_tier || 'B'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        isCollected
                                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                                      }`}
                                    >
                                      {isCollected ? 'Είσπραξη / Εξόφληση' : 'Νέα Πίστωση (Χρέωση)'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-400 text-[11px] italic">
                                    {cred.notes || '-'}
                                  </td>
                                  <td
                                    className={`py-1.5 px-2 text-right font-mono font-black ${
                                      isCollected ? 'text-emerald-400' : 'text-amber-400'
                                    }`}
                                  >
                                    {isCollected ? '-' : '+'}
                                    {formatCurrency(Number(cred.amount || 0))}
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

                {/* Employee / Manager Notes Preview */}
                {(shift.employee_notes || shift.manager_notes) && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    {shift.employee_notes && (
                      <div>
                        <span className="font-bold text-slate-700 block">Σημειώσεις Υπαλλήλου:</span>
                        <p className="text-slate-600 italic">{shift.employee_notes}</p>
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
                  <span className="text-slate-400 font-bold uppercase block mb-1">Έναρξη</span>
                  <p className="font-bold text-slate-900">{shift.opened_by_user_name || 'Υπάλληλος'}</p>
                  <p className="text-slate-500 font-mono">
                    {new Date(shift.opened_at).toLocaleString('el-GR')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block mb-1">Κλείσιμο</span>
                  <p className="font-bold text-slate-900">
                    {shift.closed_by_user_name || (shift.closed_at ? 'Υπάλληλος' : '-')}
                  </p>
                  <p className="text-slate-500 font-mono">
                    {shift.closed_at ? new Date(shift.closed_at).toLocaleString('el-GR') : 'Σε εξέλιξη'}
                  </p>
                </div>
              </div>

              {/* Expenses & Receipts */}
              {shift.expenses && shift.expenses.length > 0 ? (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Receipt className="w-4 h-4 text-indigo-600" />
                    <span>Καταχωρημένα Έξοδα Βάρδιας ({shift.expenses.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {shift.expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{exp.description}</span>
                          <span className="text-slate-500 ml-2">({exp.category})</span>
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
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                  Δεν υπάρχουν καταχωρημένα έξοδα για αυτή τη βάρδια.
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
                onClick={handleApprove}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center space-x-2 shadow-md cursor-pointer transition-all active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{loading ? 'Έγκριση...' : 'Έγκριση Βάρδιας'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reopen / Request Correction Sub-modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4">
            <h4 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>Αίτηση Διόρθωσης Βάρδιας</span>
            </h4>
            <p className="text-xs text-slate-600">
              Εισάγετε την αιτιολογία για την οποία ζητάτε από τον υπάλληλο να διορθώσει τη βάρδια.
            </p>

            <form onSubmit={handleReopenSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ενέργεια
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                >
                  <option value="CORRECTION">Αίτηση Διόρθωσης (Correction Requested)</option>
                  <option value="REOPEN">Πλήρες Επανάννοιγμα Βάρδιας (Reopened)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Αιτιολογία & Οδηγίες <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={managerNotes}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  placeholder="Π.χ. Παρακαλώ επανακαταμετρήστε τα πληρωθέντα δελτία ΟΠΑΠ..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                >
                  {loading ? 'Αποστολή...' : 'Επιβεβαίωση Αίτησης'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedReceiptUrl && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-900">Προεπισκόπηση Απόδειξης</span>
              <button
                onClick={() => setSelectedReceiptUrl(null)}
                className="p-1 text-slate-400 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={selectedReceiptUrl}
              alt="Receipt Preview"
              className="w-full max-h-[70vh] object-contain rounded-lg border border-slate-200"
            />
          </div>
        </div>
      )}

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
    </div>
  );
};
