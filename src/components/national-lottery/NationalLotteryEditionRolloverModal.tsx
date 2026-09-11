import React, { useEffect, useState } from 'react';
import { RefreshCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { previewEditionRollover, rolloverEdition, RolloverPreview } from '../../services/nationalLotteryService.ts';
import { NationalLotteryEdition } from '../../types/index.ts';

interface NationalLotteryEditionRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  storeId: string;
  currentEdition: NationalLotteryEdition | null; // null = this store has no edition yet (first-ever)
  actorUserId: string;
  onSuccess: () => void;
}

// "Νέα Έκδοση" - pre-rollover confirmation. The preview here mirrors
// exactly the pending-draw logic the rollover RPC itself applies
// (previewEditionRollover in nationalLotteryService.ts), so the numbers
// shown are accurate, not a rough estimate - but the ACTUAL transition
// only happens inside rollover_national_lottery_edition (0014), which is
// the sole source of truth and re-derives everything itself atomically.
export const NationalLotteryEditionRolloverModal: React.FC<NationalLotteryEditionRolloverModalProps> = ({
  isOpen,
  onClose,
  orgId,
  storeId,
  currentEdition,
  actorUserId,
  onSuccess,
}) => {
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNewLabel('');
    setError(null);
    if (!currentEdition) {
      setPreview(null);
      setLoadingPreview(false);
      return;
    }
    setLoadingPreview(true);
    previewEditionRollover(currentEdition)
      .then(setPreview)
      .catch((err) => setError(err.message || 'Σφάλμα φόρτωσης προεπισκόπησης'))
      .finally(() => setLoadingPreview(false));
  }, [isOpen, currentEdition]);

  const handleConfirm = async () => {
    if (!newLabel.trim()) {
      setError('Απαιτείται όνομα για τη νέα έκδοση');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await rolloverEdition({ organizationId: orgId, storeId, newEditionLabel: newLabel, actorUserId });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά τη δημιουργία νέας έκδοσης');
      setConfirming(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={RefreshCcw}
      iconClassName="text-amber-600"
      headerStyle="bordered"
      title="Νέα Έκδοση Εθνικού Λαχείου"
      subtitle={currentEdition ? `Τρέχουσα έκδοση: ${currentEdition.label}` : 'Πρώτη έκδοση για αυτό το κατάστημα'}
      size="sm"
      closeOnBackdropClick
      footer={
        <ModalActions
          onCancel={onClose}
          onSave={handleConfirm}
          saveLabel="Δημιουργία Νέας Έκδοσης"
          saveTone="amber"
          isSaving={confirming}
          savingLabel="Δημιουργία..."
          disabled={loadingPreview}
        />
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loadingPreview ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        ) : preview ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs">
            <Row label="Ενεργοί συνδρομητές" value={String(preview.activeCustomerCount)} />
            <Row label="Ολοκληρωμένοι (χωρίς εκκρεμότητα)" value={String(preview.fullyCollectedCount)} />
            <Row label="Συνδρομητές με εκκρεμείς κληρώσεις" value={String(preview.customersWithPendingCount)} />
            <Row label="Εκκρεμείς κληρώσεις (σύνολο)" value={String(preview.totalPendingTickets)} />
            <Row
              label="Οφειλή που θα μεταφερθεί στο Τεφτέρι"
              value={formatCurrency(preview.totalDebtToTransfer)}
              emphasize
            />
            {preview.customersWithPendingCount > 0 && (
              <p className="text-micro text-amber-700 pt-1">
                Οι παραπάνω εκκρεμείς κληρώσεις θα καταγραφούν ως οφειλή στο Τεφτέρι πριν μηδενιστούν οι κληρώσεις
                της νέας έκδοσης. Καμία ιστορική καταχώρηση δεν αλλάζει.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Δεν υπάρχει προηγούμενη έκδοση για αυτό το κατάστημα - δεν θα μεταφερθεί καμία οφειλή.
          </p>
        )}

        <div>
          <label htmlFor="nl-new-edition" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Όνομα Νέας Έκδοσης *
          </label>
          <input
            id="nl-new-edition"
            type="text"
            required
            maxLength={MAX_LABEL_LENGTH}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="π.χ. 2026-14"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 bg-white focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; emphasize?: boolean }> = ({ label, value, emphasize }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-amber-700">{label}</span>
    <span className={emphasize ? 'font-black text-amber-900' : 'font-bold text-amber-800'}>{value}</span>
  </div>
);
