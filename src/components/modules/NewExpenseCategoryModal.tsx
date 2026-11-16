import React, { useState } from 'react';
import { Tags } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { ExpenseCategoryDef, ExpenseSide } from '../../lib/expenseCategories.ts';
import { createExpenseCategory } from '../../services/pnlService.ts';

interface NewExpenseCategoryModalProps {
  orgId: string;
  existing: ExpenseCategoryDef[];
  onClose: () => void;
  onCreated: (category: ExpenseCategoryDef) => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

/**
 * Μια νέα κατηγορία εξόδων, με το όνομα που θέλει ο ιδιοκτήτης.
 *
 * Η πλευρά δεν είναι διακοσμητική και δεν έχει «δεν ξέρω»: από αυτήν
 * κρίνεται αν το έξοδο βαραίνει το πρακτορείο ή τον καφέ, δηλαδή ποια από
 * τις δύο κερδοφορίες πέφτει. Αν την παραλείπαμε, κάθε νέα κατηγορία θα
 * προσγειωνόταν σιωπηλά στο πρακτορείο.
 */
export const NewExpenseCategoryModal: React.FC<NewExpenseCategoryModalProps> = ({ orgId, existing, onClose, onCreated }) => {
  const [label, setLabel] = useState('');
  const [side, setSide] = useState<ExpenseSide>('AGENCY');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = label.trim();
  const duplicate = existing.some((c) => c.label.trim().toLocaleLowerCase('el-GR') === trimmed.toLocaleLowerCase('el-GR'));
  const canSave = trimmed !== '' && !duplicate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      onCreated(await createExpenseCategory(orgId, trimmed, side, existing.map((c) => c.key)));
      onClose();
    } catch (err: any) {
      setError(err.message || 'Η δημιουργία απέτυχε.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Νέα κατηγορία εξόδων"
      icon={Tags}
      headerStyle="bordered"
      size="md"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={<ModalActions onCancel={onClose} isSaving={isSaving} disabled={!canSave} />}
    >
      <div className="space-y-4 text-sm">
        <div>
          <label htmlFor="new-category-label" className="block text-xs font-bold text-slate-600 mb-1">
            Όνομα κατηγορίας
          </label>
          <input
            id="new-category-label"
            type="text"
            autoFocus
            required
            maxLength={MAX_LABEL_LENGTH}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="π.χ. Ποτά & Αναψυκτικά"
            className={inputClass}
          />
          {duplicate && <p className="text-micro text-rose-600 font-bold mt-1">Υπάρχει ήδη κατηγορία με αυτό το όνομα.</p>}
        </div>

        <fieldset>
          <legend className="block text-xs font-bold text-slate-600 mb-1">Σε ποια δουλειά ανήκει</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ['AGENCY', 'Πρακτορείο'],
                ['FNB', 'Καφές (F&B)'],
                ['COMPANY', 'Εταιρία'],
              ] as Array<[ExpenseSide, string]>
            ).map(([value, text]) => (
              <label
                key={value}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                  side === value ? 'border-indigo-500 bg-indigo-50 text-indigo-900' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="new-category-side"
                  value={value}
                  checked={side === value}
                  onChange={() => setSide(value)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-bold">{text}</span>
              </label>
            ))}
          </div>
          <p className="text-micro text-slate-500 mt-1.5">
            Καθορίζει πού μετράνε τα έξοδα αυτής της κατηγορίας στο P&L. <strong>Εταιρία</strong> για ΕΦΚΑ, ΙΚΑ, εφορία: δεν
            βαραίνουν κανένα μαγαζί, πάνε στα Έξοδα Εταιρίας. Αλλάζει αργότερα.
          </p>
        </fieldset>

        {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
