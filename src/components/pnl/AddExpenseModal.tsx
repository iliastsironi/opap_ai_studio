import React, { useState } from 'react';
import { Receipt } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { FNB_EXPENSE_CATEGORY } from '../../lib/pnlEngine.ts';
import { createExpenseInFirestore } from '../../services/moduleServices.ts';
import { MoneyInput, parseMoney } from './moneyInput.tsx';
import { defaultEntryDate, monthBounds } from './pnlDisplay.tsx';

const STORE_CATEGORIES: Array<[string, string]> = [
  ['EXPENSES_GP', 'Έξοδα ΓΠ (Γενικά Πληρωμών)'],
  ['SUPPLIES', 'Αναλώσιμα / Χαρτί'],
  ['CLEANING', 'Καθαριότητα'],
  ['MAINTENANCE', 'Συντήρηση / Βλάβες'],
  ['UTILITIES', 'Λογαριασμοί / Utilities'],
  ['OTHER', 'Λοιπά Έξοδα'],
];

interface AddExpenseModalProps {
  month: string;
  orgId: string;
  storeId: string;
  storeName: string;
  kind: 'STORE' | 'FNB';
  suppliers: string[];
  userId: string;
  userName?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

// Creates a normal expense record - the same one the Expenses module and shifts use.
export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  month,
  orgId,
  storeId,
  storeName,
  kind,
  suppliers,
  userId,
  userName,
  onClose,
  onSaved,
}) => {
  const [date, setDate] = useState(() => defaultEntryDate(month));
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('EXPENSES_GP');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { min, max } = monthBounds(month);
  const parsedAmount = parseMoney(amount);
  const canSave = recipient.trim() !== '' && parsedAmount !== null && parsedAmount > 0 && date >= min && date <= max;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || parsedAmount === null) return;
    setIsSaving(true);
    setError(null);
    try {
      await createExpenseInFirestore({
        organization_id: orgId,
        store_id: storeId,
        category: kind === 'FNB' ? FNB_EXPENSE_CATEGORY : category,
        amount: parsedAmount,
        payment_method: paymentMethod,
        recipient: recipient.trim(),
        date,
        created_by_user_id: userId,
        created_by_user_name: userName,
      });
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Η αποθήκευση απέτυχε.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={kind === 'FNB' ? 'Νέο έξοδο F&B' : 'Νέο έξοδο ημέρας'}
      subtitle={storeName}
      icon={Receipt}
      headerStyle="bordered"
      size="md"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={<ModalActions onCancel={onClose} isSaving={isSaving} disabled={!canSave} />}
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="expense-date" className="block text-xs font-bold text-slate-600 mb-1">
              Ημερομηνία
            </label>
            <input
              id="expense-date"
              type="date"
              min={min}
              max={max}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="expense-amount" className="block text-xs font-bold text-slate-600 mb-1">
              Ποσό (€)
            </label>
            <MoneyInput id="expense-amount" value={amount} onChange={setAmount} />
          </div>
        </div>

        <div>
          <label htmlFor="expense-recipient" className="block text-xs font-bold text-slate-600 mb-1">
            Προμηθευτής
          </label>
          <input
            id="expense-recipient"
            type="text"
            list="pnl-expense-suppliers"
            required
            value={recipient}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="π.χ. Κάβα Ζωγράφου"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <datalist id="pnl-expense-suppliers">
            {suppliers.map((supplier) => (
              <option key={supplier} value={supplier} />
            ))}
          </datalist>
        </div>

        {kind === 'STORE' && (
          <div>
            <label htmlFor="expense-category" className="block text-xs font-bold text-slate-600 mb-1">
              Κατηγορία
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              {STORE_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="block text-xs font-bold text-slate-600 mb-1">Πληρωμή</legend>
          <div className="flex gap-2">
            {(
              [
                ['CASH', 'Μετρητά'],
                ['CARD', 'Κάρτα / POS'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex-1 text-center px-3 py-2 rounded-xl border font-bold cursor-pointer ${
                  paymentMethod === value ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="expense-payment"
                  value={value}
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
