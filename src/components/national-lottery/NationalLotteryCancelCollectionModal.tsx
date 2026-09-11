import React, { useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { cancelCollection } from '../../services/nationalLotteryService.ts';

interface NationalLotteryCancelCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  drawLabel: string; // e.g. "Κλήρωση Β" or "3 κληρώσεις (Β, Γ, Δ)" for a bulk batch
  actorUserId: string;
  onSuccess: () => void;
}

// "Ακύρωση καταχώρησης" - never a destructive delete. Reverts the draw(s)
// to pending, reverses the financial movement, keeps the original
// transaction in audit history (see cancelCollection in
// nationalLotteryService.ts for exactly how - it never deletes a row).
export const NationalLotteryCancelCollectionModal: React.FC<NationalLotteryCancelCollectionModalProps> = ({
  isOpen,
  onClose,
  batchId,
  drawLabel,
  actorUserId,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await cancelCollection({ batchId, cancelledByUserId: actorUserId, reason: reason.trim() || undefined });
      setReason('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την ακύρωση');
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onCancel={() => {
        setReason('');
        setError(null);
        onClose();
      }}
      onConfirm={handleConfirm}
      tone="destructive"
      title="Ακύρωση Καταχώρησης Παραλαβής"
      confirmLabel="Ακύρωση Καταχώρησης"
      cancelLabel="Πίσω"
      isLoading={saving}
      loadingLabel="Ακύρωση..."
      message={
        <div className="space-y-3">
          <p>
            Θα ακυρωθεί η καταχώρηση: <strong>{drawLabel}</strong>. Η κλήρωση θα επανέλθει σε εκκρεμή κατάσταση και
            το ποσό θα αφαιρεθεί από τις πωλήσεις Σκρατς. Η αρχική καταχώρηση παραμένει στο ιστορικό ελέγχου.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Λόγος ακύρωσης (προαιρετικό)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_NOTES_LENGTH))}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:border-indigo-500"
              placeholder="π.χ. Λάθος πελάτης"
            />
          </div>
          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
        </div>
      }
    />
  );
};
