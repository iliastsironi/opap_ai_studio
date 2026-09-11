import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { collectDraws, NATIONAL_LOTTERY_DISPLAY_PRICES } from '../../services/nationalLotteryService.ts';
import {
  NationalLotteryCustomer,
  NationalLotteryCustomerEdition,
  NationalLotteryEdition,
  NationalLotteryDrawCode,
  NationalLotteryDrawCollection,
} from '../../types/index.ts';

const DRAW_LABELS: Record<NationalLotteryDrawCode, string> = { A: 'Α', B: 'Β', C: 'Γ', D: 'Δ', ST: 'ΣΤ' };

interface NationalLotteryCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: NationalLotteryCustomer;
  customerEdition: NationalLotteryCustomerEdition;
  edition: NationalLotteryEdition;
  drawCodes: NationalLotteryDrawCode[]; // one (single) or several (bulk) selected draws
  orgId: string;
  storeId: string;
  shiftId: string | null;
  actorUserId: string;
  onSuccess: (collections: NationalLotteryDrawCollection[]) => void;
}

// Single/bulk collection confirm - the employee-facing "Παραλαβή" action.
// The displayed total is a preview only (NATIONAL_LOTTERY_DISPLAY_PRICES,
// non-authoritative); the actual charge is always whatever the backend
// trigger computes, re-read from the inserted rows on success.
export const NationalLotteryCollectionModal: React.FC<NationalLotteryCollectionModalProps> = ({
  isOpen,
  onClose,
  customer,
  customerEdition,
  edition,
  drawCodes,
  orgId,
  storeId,
  shiftId,
  actorUserId,
  onSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictNote, setConflictNote] = useState<string | null>(null);

  const unitPrice = NATIONAL_LOTTERY_DISPLAY_PRICES[customer.participation_type];
  const previewTotal = drawCodes.length * unitPrice;
  const drawLabelsText = drawCodes.map((c) => DRAW_LABELS[c]).join(', ');

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    setConflictNote(null);
    try {
      const result = await collectDraws({
        organizationId: orgId,
        storeId,
        nationalLotteryCustomerId: customer.id,
        customerEditionId: customerEdition.id,
        editionId: edition.id,
        drawCodes,
        shiftId,
        createdByUserId: actorUserId,
      });

      if (result.wasConflict) {
        const stillMine = result.collections.every((c) => c.created_by_user_id === actorUserId);
        if (!stillMine) {
          setConflictNote('Κάποιες από αυτές τις κληρώσεις καταχωρήθηκαν μόλις τώρα από άλλον υπάλληλο. Η κατάσταση ενημερώθηκε.');
          setSaving(false);
          onSuccess(result.collections);
          return;
        }
      }

      onSuccess(result.collections);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την καταχώρηση παραλαβής');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={CheckCircle2}
      iconClassName="text-emerald-600"
      headerStyle="bordered"
      title="Παραλαβή Εθνικού Λαχείου"
      subtitle={customer.full_name}
      size="sm"
      closeOnBackdropClick
      footer={
        <ModalActions
          onCancel={onClose}
          onSave={handleConfirm}
          saveLabel={`Επιβεβαίωση παραλαβής — ${formatCurrency(previewTotal)}`}
          saveTone="primary"
          isSaving={saving}
          savingLabel="Καταχώρηση..."
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
        {conflictNote && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{conflictNote}</span>
          </div>
        )}

        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
            {drawCodes.length} {drawCodes.length === 1 ? 'λαχείο' : 'λαχεία'} × {formatCurrency(unitPrice)}
          </p>
          <p className="text-2xl font-black text-emerald-800 mt-1">{formatCurrency(previewTotal)}</p>
          <p className="text-micro text-emerald-600 mt-1">Κληρώσεις: {drawLabelsText}</p>
        </div>

        <p className="text-micro text-slate-400">
          {customer.participation_type === 'FIVE' ? '5άδα' : '10άδα'} · Έκδοση {edition.label}
        </p>
      </div>
    </Modal>
  );
};
