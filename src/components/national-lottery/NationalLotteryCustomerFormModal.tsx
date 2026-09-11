import React, { useEffect, useState } from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import {
  saveNationalLotteryCustomer,
  enrollCustomerInCurrentEdition,
} from '../../services/nationalLotteryService.ts';
import { NationalLotteryCustomer, NationalLotteryEdition, NationalLotteryParticipationType } from '../../types/index.ts';

interface NationalLotteryCustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  storeId: string;
  editingCustomer: NationalLotteryCustomer | null; // null = creating new
  activeEdition: NationalLotteryEdition | null;
  onSaved: () => void;
}

// Registry CRUD (Owner/Manager - national_lottery.manage). Modeled directly
// on CustomerCreditDirectoryModal.tsx's embedded add/edit form pattern
// (Modal + bodyAsForm + ModalActions, MAX_LABEL_LENGTH caps) rather than
// inventing a new form recipe.
export const NationalLotteryCustomerFormModal: React.FC<NationalLotteryCustomerFormModalProps> = ({
  isOpen,
  onClose,
  orgId,
  storeId,
  editingCustomer,
  activeEdition,
  onSaved,
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [lotteryNumber, setLotteryNumber] = useState('');
  const [participationType, setParticipationType] = useState<NationalLotteryParticipationType>('FIVE');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFullName(editingCustomer?.full_name || '');
    setPhone(editingCustomer?.phone || '');
    setLotteryNumber(editingCustomer?.lottery_number || '');
    setParticipationType(editingCustomer?.participation_type || 'FIVE');
    setNotes(editingCustomer?.notes || '');
    setError(null);
  }, [isOpen, editingCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await saveNationalLotteryCustomer({
        id: editingCustomer?.id,
        organization_id: orgId,
        store_id: storeId,
        full_name: fullName,
        phone: phone || undefined,
        lottery_number: lotteryNumber || undefined,
        participation_type: participationType,
        notes: notes || undefined,
      });
      // A brand-new subscriber starts participating in the store's current
      // edition right away, rather than waiting for the next rollover -
      // no-ops safely if already enrolled (enrollCustomerInCurrentEdition
      // relies on the table's own UNIQUE constraint).
      if (!editingCustomer && activeEdition) {
        await enrollCustomerInCurrentEdition(saved, activeEdition);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την αποθήκευση συνδρομητή');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      headerStyle="bordered"
      icon={UserPlus}
      title={editingCustomer ? 'Επεξεργασία Συνδρομητή' : 'Νέος Συνδρομητής Εθνικού Λαχείου'}
      size="sm"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={
        <ModalActions
          onCancel={onClose}
          saveLabel={editingCustomer ? 'Αποθήκευση Αλλαγών' : 'Δημιουργία Συνδρομητή'}
          isSaving={saving}
          savingLabel="Αποθήκευση..."
        />
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-center space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="nl-name" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Ονοματεπώνυμο *
          </label>
          <input
            id="nl-name"
            type="text"
            required
            maxLength={MAX_LABEL_LENGTH}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="π.χ. Γιώργος Παπαδόπουλος"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="nl-phone" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Τηλέφωνο
          </label>
          <input
            id="nl-phone"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="π.χ. 697 123 4567"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white font-mono focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="nl-number" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Αριθμός Λαχείου
          </label>
          <input
            id="nl-number"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            value={lotteryNumber}
            onChange={(e) => setLotteryNumber(e.target.value)}
            placeholder="π.χ. 4471"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 bg-white focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-micro font-bold text-slate-700 uppercase block mb-1">Τύπος Συμμετοχής *</label>
          <div className="grid grid-cols-2 gap-2">
            {(['FIVE', 'TEN'] as NationalLotteryParticipationType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setParticipationType(type)}
                className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                  participationType === type
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {type === 'FIVE' ? '5άδα — 20€/κλήρωση' : '10άδα — 40€/κλήρωση'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="nl-notes" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Σημειώσεις
          </label>
          <textarea
            id="nl-notes"
            rows={2}
            maxLength={MAX_NOTES_LENGTH}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 bg-white focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>
    </Modal>
  );
};
