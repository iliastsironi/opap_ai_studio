import React, { useState } from 'react';
import { Clock, Play, AlertCircle, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ShiftType, ShiftStatus } from '../../types/index.ts';
import { createShiftInFirestore } from '../../services/shiftService.ts';

interface ShiftOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shiftId: string) => void;
  stores: Array<{ id: string; name: string; code: string }>;
}

export const ShiftOpeningModal: React.FC<ShiftOpeningModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stores,
}) => {
  const { token, user, organization } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(stores[0]?.id || '');
  const [registerId, setRegisterId] = useState<string>('REG-01');
  const [shiftType, setShiftType] = useState<ShiftType>('MORNING');
  const [openingCash, setOpeningCash] = useState<string>('200.00');
  const [openingNotes, setOpeningNotes] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedStoreId) {
      setError('Παρακαλώ επιλέξτε κατάστημα.');
      return;
    }

    const cashNum = parseFloat(openingCash.replace(',', '.'));
    if (isNaN(cashNum) || cashNum < 0) {
      setError('Παρακαλώ εισάγετε έγκυρο αρχικό ποσό ταμείου.');
      return;
    }

    setLoading(true);
    try {
      const targetStore = stores.find((s) => s.id === selectedStoreId);
      const fsShift = await createShiftInFirestore({
        organization_id: organization?.id || 'org_opap_demo',
        store_id: selectedStoreId,
        store_name: targetStore?.name || 'OPAP Agency',
        store_code: targetStore?.code || 'STR-01',
        register_id: registerId,
        shift_type: shiftType,
        status: 'OPEN' as ShiftStatus,
        opened_by_user_id: user?.id || 'usr_anonymous',
        opened_by_user_name: user ? `${user.first_name} ${user.last_name}` : 'Χρήστης',
        opened_at: new Date().toISOString(),
        opening_cash: cashNum,
        opening_operational_notes: openingNotes,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Try server API as well
      try {
        await fetch('/api/v1/shifts/open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            store_id: selectedStoreId,
            register_id: registerId,
            shift_type: shiftType,
            opening_cash: cashNum,
            opening_operational_notes: openingNotes,
          }),
        });
      } catch (e) {
        console.log('Server endpoint sync bypassed, Firestore persisted successfully.');
      }

      onSuccess(fsShift.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα επικοινωνίας με το διακομιστή');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Play className="w-5 h-5 ml-0.5 fill-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Έναρξη Νέας Βάρδιας</h3>
              <p className="text-xs text-slate-300">Καταχώρηση αρχικού ταμείου & στοιχείων</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Store Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Κατάστημα <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">-- Επιλέξτε Κατάστημα --</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Cash Register */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ταμείο / Register
              </label>
              <select
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="REG-01">Ταμείο 1 (REG-01)</option>
                <option value="REG-02">Ταμείο 2 (REG-02)</option>
                <option value="REG-03">Ταμείο 3 (REG-03)</option>
              </select>
            </div>

            {/* Shift Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Τύπος Βάρδιας
              </label>
              <select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value as ShiftType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="MORNING">Πρωινή (08:00 - 16:00)</option>
                <option value="AFTERNOON">Απογευματινή (16:00 - 00:00)</option>
                <option value="NIGHT">Βραδινή (00:00 - 08:00)</option>
                <option value="CUSTOM">Ειδική / Έκτακτη</option>
              </select>
            </div>
          </div>

          {/* Opening Cash Float */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Αρχικό Ταμείο (Opening Cash Float €) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="200.00"
                className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-slate-200 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                €
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Το ποσό των ψιλών που παραδίδεται στο ταμείο κατά την έναρξη.
            </p>
          </div>

          {/* Operational Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Σημειώσεις Έναρξης (Προαιρετικό)
            </label>
            <textarea
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder="Π.χ. Παραδόθηκαν 200€ σε ψιλά, όλα τα τερματικά λειτουργικά..."
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Άνοιγμα...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Επιβεβαίωση & Έναρξη</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
