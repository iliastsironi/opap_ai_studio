import React, { useState } from 'react';
import { RefreshCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { ShiftTemplateConfig } from '../../types/index.ts';
import { saveShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { writeAuditLog } from '../../services/auditLogService.ts';
import {
  ScratchSellingMode,
  getLatestStoreScratchInventory,
  saveLatestStoreScratchInventory,
  previewFrontOnlyConversion,
  applyFrontOnlyConversion,
} from './ScratchCalculatorTable.tsx';

const MODE_LABELS: Record<ScratchSellingMode, string> = {
  FRONT_AND_BACK: 'Μπροστά + Πίσω',
  FRONT_ONLY: 'Μόνο Μπροστά',
};

interface ScratchModeChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The store's full current template row - saved back with only
  // scratch_selling_mode overridden, so every other field (show_*,
  // scratch_backside_default, custom_fields, ...) is preserved exactly.
  template: ShiftTemplateConfig;
  storeId: string;
  onSaved: (newMode: ScratchSellingMode) => void;
}

// Owner-facing mode-switch flow (Configurator -> "Λειτουργία Πώλησης
// Σκρατς"). Switching TO Front-only offers the spec's two options
// ("Εφαρμογή από τώρα" / "Μετατροπή τρέχοντος αποθέματος"); switching back
// to Front+Back is always a plain apply - nothing was destroyed going that
// direction, stale back-side fields simply become live again.
export const ScratchModeChangeModal: React.FC<ScratchModeChangeModalProps> = ({
  isOpen,
  onClose,
  template,
  storeId,
  onSaved,
}) => {
  const { organization, user } = useAuth();
  const currentMode = template.scratch_selling_mode;
  const targetMode: ScratchSellingMode = currentMode === 'FRONT_ONLY' ? 'FRONT_AND_BACK' : 'FRONT_ONLY';
  const isSwitchingToFrontOnly = targetMode === 'FRONT_ONLY';

  const [option, setOption] = useState<'apply_now' | 'convert'>('apply_now');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read on every render (cheap, synchronous localStorage) rather than
  // caching in state, so the preview never goes stale while the modal is open.
  const inventory = isSwitchingToFrontOnly ? getLatestStoreScratchInventory(storeId) || [] : [];
  const preview = isSwitchingToFrontOnly ? previewFrontOnlyConversion(inventory) : null;

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      let convertedCount = 0;
      let flaggedCount = 0;

      // Inventory transform happens BEFORE the mode is persisted: if the
      // save below fails, the store's live behavior hasn't changed yet, so
      // leaving the (harmless, still-Front+Back-interpreted) transformed
      // catalog in localStorage in that failure case is not a correctness
      // problem - it just means the fields were cleared a moment early.
      if (isSwitchingToFrontOnly && option === 'convert' && preview) {
        saveLatestStoreScratchInventory(storeId, applyFrontOnlyConversion(inventory));
        convertedCount = preview.convertibleRows.length;
        flaggedCount = preview.flaggedRows.length;
      }

      const updatedTemplate: ShiftTemplateConfig = { ...template, scratch_selling_mode: targetMode };
      await saveShiftTemplateConfig(updatedTemplate);

      writeAuditLog({
        organizationId: organization?.id || template.organization_id,
        userId: user?.id,
        userEmail: user?.email,
        action: 'SCRATCH_SELLING_MODE_CHANGED',
        entityType: 'store',
        entityId: storeId,
        beforeState: { scratch_selling_mode: currentMode },
        afterState: {
          scratch_selling_mode: targetMode,
          conversion: isSwitchingToFrontOnly ? option : 'n/a',
          convertedCount,
          flaggedCount,
        },
      });

      onSaved(targetMode);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την αλλαγή λειτουργίας πώλησης Σκρατς');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={RefreshCcw}
      iconClassName="text-amber-600"
      headerStyle="bordered"
      title="Αλλαγή Λειτουργίας Πώλησης Σκρατς"
      subtitle={`${MODE_LABELS[currentMode]} → ${MODE_LABELS[targetMode]}`}
      size="md"
      closeOnBackdropClick
      footer={
        <ModalActions
          onCancel={onClose}
          onSave={handleConfirm}
          saveLabel="Επιβεβαίωση Αλλαγής"
          saveTone="amber"
          isSaving={saving}
          savingLabel="Αποθήκευση..."
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

        {!isSwitchingToFrontOnly && (
          <p className="text-sm text-slate-600">
            Το κατάστημα θα επιστρέψει σε πώληση <strong>Μπροστά + Πίσω</strong>. Καμία ιστορική βάρδια δεν
            επηρεάζεται - η αλλαγή ισχύει μόνο για νέες καταχωρήσεις από τώρα και μετά.
          </p>
        )}

        {isSwitchingToFrontOnly && (
          <>
            <p className="text-sm text-slate-600">
              Επιλέξτε πώς θα εφαρμοστεί η λειτουργία <strong>Μόνο Μπροστά</strong> στο τρέχον απόθεμα του
              καταστήματος. Καμία ιστορική βάρδια δεν επηρεάζεται σε καμία από τις δύο επιλογές.
            </p>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${
                  option === 'apply_now' ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="scratch-mode-option"
                  className="mt-1 accent-indigo-600"
                  checked={option === 'apply_now'}
                  onChange={() => setOption('apply_now')}
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Εφαρμογή από τώρα</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Η νέα λειτουργία ισχύει μόνο για νέες καταχωρήσεις. Το τρέχον απόθεμα δεν αλλάζει.
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${
                  option === 'convert' ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="scratch-mode-option"
                  className="mt-1 accent-indigo-600"
                  checked={option === 'convert'}
                  onChange={() => setOption('convert')}
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Μετατροπή τρέχοντος αποθέματος</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Καθαρίζει την Πίσω πλευρά στα πακέτα όπου δεν έχει καταγραφεί καμία πώληση από Πίσω.
                  </span>
                </span>
              </label>
            </div>

            {option === 'convert' && preview && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
                <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Θα μετατραπούν: {preview.convertibleRows.length} πακέτα
                </p>
                {preview.flaggedRows.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Χρειάζονται προσοχή: {preview.flaggedRows.length} πακέτα
                    </p>
                    <ul className="text-micro text-rose-700 pl-5 list-disc">
                      {preview.flaggedRows.map((r) => (
                        <li key={r.id}>{r.name} - έχει καταγεγραμμένη πώληση από Πίσω, δεν μετατρέπεται αυτόματα.</li>
                      ))}
                    </ul>
                    <p className="text-micro text-slate-500">
                      Κλείστε ή διορθώστε αυτά τα πακέτα ξεχωριστά για να μετατραπούν με ασφάλεια αργότερα.
                    </p>
                  </>
                )}
                {preview.convertibleRows.length === 0 && preview.flaggedRows.length === 0 && (
                  <p className="text-micro text-slate-500">
                    Δεν βρέθηκε αποθηκευμένο ενεργό απόθεμα Σκρατς για αυτό το κατάστημα σε αυτή τη συσκευή.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
