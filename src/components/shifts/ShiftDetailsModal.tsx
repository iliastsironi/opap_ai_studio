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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Shift } from '../../types/index.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';
import { ShiftLedgerSheet } from './ShiftLedgerSheet.tsx';

interface ShiftDetailsModalProps {
  shift: Shift | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenClosingWizard?: (shift: Shift) => void;
}

export const ShiftDetailsModal: React.FC<ShiftDetailsModalProps> = ({
  shift,
  isOpen,
  onClose,
  onRefresh,
  onOpenClosingWizard,
}) => {
  const { token, hasPermission, roles } = useAuth();
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'SHEET'>('SHEET');
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

      try {
        await fetch(`/api/v1/shifts/${shift.id}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ manager_notes: managerNotes || 'Εγκρίθηκε από τον διευθυντή' }),
        });
      } catch (e) {
        // server endpoint fallback
      }

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

      try {
        await fetch(`/api/v1/shifts/${shift.id}/reopen`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            manager_notes: managerNotes,
            action_type: actionType,
          }),
        });
      } catch (e) {
        // server endpoint fallback
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-100 my-8">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base">Λεπτομέρειες Βάρδιας</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    shift.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : shift.status === 'SUBMITTED'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : shift.status === 'CORRECTION_REQUESTED'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {shift.status === 'APPROVED'
                    ? 'ΕΓΚΕΚΡΙΜΕΝΗ'
                    : shift.status === 'SUBMITTED'
                    ? 'ΥΠΟΒΛΗΘΗΚΕ (ΑΜΕΤΑΒΛΗΤΗ)'
                    : shift.status === 'CORRECTION_REQUESTED'
                    ? 'ΑΙΤΗΣΗ ΔΙΟΡΘΩΣΗΣ'
                    : shift.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {shift.store_name} ({shift.register_id})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveTab('SHEET')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'SHEET'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Φύλλο Αναφοράς Βάρδιας (Ledger Report)
            </button>
            <button
              onClick={() => setActiveTab('SUMMARY')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'SUMMARY'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Σύνοψη & Παραστατικά
            </button>
          </div>

          {activeTab === 'SHEET' ? (
            <ShiftLedgerSheet shift={shift} readOnly={true} />
          ) : (
            <>
              {(() => {
                const posTotal = shift.card_payments || (shift.custom_field_values?.tora_pos_items || []).reduce((acc: number, item: any) => acc + (parseFloat(item.amount) || 0), 0) || 0;
                const expensesTotal = (shift.expenses || []).reduce((acc: number, e: any) => acc + (e.amount || 0), 0) || (shift.expenses_paid_cash || 0);
                const creditGranted = shift.customer_credit_granted || 0;
                const creditCollected = shift.customer_credit_collected || 0;
                const totalReconciliationCount = shift.custom_field_values?.total_reconciliation_count !== undefined
                  ? Number(shift.custom_field_values.total_reconciliation_count)
                  : (shift.counted_cash || 0) + posTotal + expensesTotal + creditGranted - creditCollected - (shift.opening_cash || 0);

                return (
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

                    {/* Σύνολο Καταμέτρησης Banner */}
                    <div className="bg-indigo-900 text-white p-4 rounded-2xl border border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                      <div>
                        <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider block">
                          Σύνολο Καταμέτρησης
                        </span>
                        <p className="text-[11px] text-indigo-200/80 mt-0.5">
                          (Μετρημένα στο συρτάρι + Πωλήσεις POS + Έξοδα + Πιστώσεις - Επιστροφές) - Αρχικό
                        </p>
                      </div>
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {totalReconciliationCount.toFixed(2)} €
                      </span>
                    </div>

                    {/* Summary Figures Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">
                          Αρχικό Ταμείο
                        </span>
                        <span className="text-lg font-black text-slate-900">
                          {shift.opening_cash.toFixed(2)} €
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">
                          Αναμενόμενο Ταμείο
                        </span>
                        <span className="text-lg font-black text-emerald-700">
                          {shift.expected_cash.toFixed(2)} €
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">
                          Μετρητά Συρταριού
                        </span>
                        <span className="text-lg font-black text-indigo-700">
                          {shift.counted_cash.toFixed(2)} €
                        </span>
                      </div>

                      <div
                        className={`p-3.5 rounded-xl border ${
                          shift.is_unbalanced ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase block text-slate-700">
                          Απόκλιση
                        </span>
                        <span
                          className={`text-lg font-black ${
                            shift.discrepancy < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {shift.discrepancy > 0 ? '+' : ''}
                          {shift.discrepancy.toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}

          {/* Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100 px-4 py-2 font-bold text-slate-800 border-b border-slate-200">
              Οικονομική Ανάλυση Βάρδιας
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              <div className="px-4 py-2 flex justify-between">
                <span>ΟΠΑΠ Ακαθάριστα / Πληρωμές / Καθαρά</span>
                <span className="font-bold">
                  {shift.opap_gross_sales.toFixed(2)}€ / -{shift.opap_payouts.toFixed(2)}€ ={' '}
                  <span className="text-emerald-700">
                    {(shift.opap_gross_sales - shift.opap_payouts).toFixed(2)}€
                  </span>
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span>VLTs Cash-In / Cash-Out / Καθαρά</span>
                <span className="font-bold">
                  {shift.vlts_cash_in.toFixed(2)}€ / -{shift.vlts_cash_out.toFixed(2)}€ ={' '}
                  <span className="text-emerald-700">
                    {(shift.vlts_cash_in - shift.vlts_cash_out).toFixed(2)}€
                  </span>
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span>Πωλήσεις FnB (Μετρητά / Κάρτες)</span>
                <span className="font-bold">
                  {shift.fnb_cash.toFixed(2)}€ (Μετρητά) / {shift.fnb_card.toFixed(2)}€ (Κάρτες)
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span>Αφαιρέσεις Καρτών POS / Εξόδων</span>
                <span className="font-bold text-rose-600">
                  -{shift.card_payments.toFixed(2)}€ (POS) / -{shift.expenses_paid_cash.toFixed(2)}€
                  (Έξοδα)
                </span>
              </div>
            </div>
          </div>

          {/* Expenses & Receipts */}
          {shift.expenses && shift.expenses.length > 0 && (
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
                      <span className="font-bold text-slate-900">{exp.amount.toFixed(2)} €</span>
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
          )}

          {/* Notes */}
          {(shift.employee_notes || shift.manager_notes) && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
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
          </>
          )}
        </div>


        {/* Modal Footer Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
          >
            Κλείσιμο
          </button>

          <div className="flex items-center space-x-2">
            {/* If shift is CORRECTION_REQUESTED or REOPENED, employee can edit */}
            {(shift.status === 'CORRECTION_REQUESTED' || shift.status === 'REOPENED') &&
              onOpenClosingWizard && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenClosingWizard(shift);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Άνοιγμα Οδηγού Διόρθωσης</span>
                </button>
              )}

            {/* Manager Actions */}
            {shift.status === 'SUBMITTED' && canApprove && (
              <button
                onClick={handleApprove}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Έγκριση Βάρδιας</span>
              </button>
            )}

            {['SUBMITTED', 'APPROVED'].includes(shift.status) && canReopen && (
              <button
                onClick={() => setShowReopenModal(true)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Αίτηση Διόρθωσης / Επανάννοιγμα</span>
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
    </div>
  );
};
