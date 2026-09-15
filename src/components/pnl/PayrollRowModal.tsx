import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { PnlPayrollRow, PnlStore, PnlUnit, monthPeriod, payrollCashInHand, payrollTotal } from '../../lib/pnlEngine.ts';
import { MoneyInput, isValidMoney, moneyInputValue, parseMoney } from './moneyInput.tsx';

const PAY_FIELDS = [
  ['baseSalary', 'Μισθός'],
  ['salaryIncrease', 'Αυξ. Μισθού'],
  ['overtimeAmount', 'Υπερωρίες (€)'],
  ['christmasBonus', 'Δώρο Χρ.'],
  ['holidayAllowance', 'Επ. Αδείας'],
  ['leaveCompensation', 'Αποζ. Αδείας'],
  ['bonus', 'Bonus'],
] as const;

const PAYOUT_FIELDS = [
  ['bankAmount', 'Ποσό σε Τράπεζα'],
  ['advancePayment', 'Προκαταβολή'],
] as const;

type MoneyField = (typeof PAY_FIELDS)[number][0] | (typeof PAYOUT_FIELDS)[number][0];
const MONEY_FIELDS: MoneyField[] = [...PAY_FIELDS.map(([field]) => field), ...PAYOUT_FIELDS.map(([field]) => field)];

interface PayrollRowModalProps {
  isOpen: boolean;
  month: string;
  stores: PnlStore[];
  row: PnlPayrollRow | null;
  onClose: () => void;
  onSave: (row: PnlPayrollRow, storeName: string) => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

export const PayrollRowModal: React.FC<PayrollRowModalProps> = ({ isOpen, month, stores, row, onClose, onSave }) => {
  const [storeId, setStoreId] = useState('');
  const [unit, setUnit] = useState<PnlUnit>('STORE');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [iban, setIban] = useState('');
  const [leaveDays, setLeaveDays] = useState('');
  const [money, setMoney] = useState<Record<MoneyField, string>>({} as Record<MoneyField, string>);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStoreId(row?.storeId ?? stores[0]?.id ?? '');
    setUnit(row?.unit ?? 'STORE');
    setName(row?.name ?? '');
    setEmail(row?.email ?? '');
    setIban(row?.iban ?? '');
    setLeaveDays(row?.leaveDaysTaken ? String(row.leaveDaysTaken).replace('.', ',') : '');
    setMoney(Object.fromEntries(MONEY_FIELDS.map((field) => [field, moneyInputValue(row ? row[field] : 0)])) as Record<MoneyField, string>);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const moneyValue = (field: MoneyField) => parseMoney(money[field] ?? '') ?? 0;
  const draft: PnlPayrollRow = {
    id: row?.id,
    storeId,
    unit,
    period: monthPeriod(month),
    name,
    email,
    iban,
    baseSalary: moneyValue('baseSalary'),
    salaryIncrease: moneyValue('salaryIncrease'),
    overtimeAmount: moneyValue('overtimeAmount'),
    christmasBonus: moneyValue('christmasBonus'),
    holidayAllowance: moneyValue('holidayAllowance'),
    leaveDaysTaken: parseMoney(leaveDays) ?? 0,
    leaveCompensation: moneyValue('leaveCompensation'),
    bonus: moneyValue('bonus'),
    bankAmount: moneyValue('bankAmount'),
    advancePayment: moneyValue('advancePayment'),
  };
  const valid =
    name.trim() !== '' &&
    storeId !== '' &&
    MONEY_FIELDS.every((field) => isValidMoney(money[field] ?? '')) &&
    isValidMoney(leaveDays);
  const total = payrollTotal(draft);
  const cashInHand = payrollCashInHand(draft);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draft, stores.find((store) => store.id === storeId)?.name ?? '');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Η αποθήκευση απέτυχε.');
    } finally {
      setIsSaving(false);
    }
  };

  const moneyGrid = (fields: ReadonlyArray<readonly [MoneyField, string]>) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {fields.map(([field, label]) => (
        <div key={field}>
          <label htmlFor={`payroll-${field}`} className="block text-xs font-bold text-slate-600 mb-1">
            {label}
          </label>
          <MoneyInput id={`payroll-${field}`} value={money[field] ?? ''} onChange={(value) => setMoney({ ...money, [field]: value })} />
        </div>
      ))}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={row?.id ? 'Επεξεργασία μισθοδοσίας' : 'Νέος εργαζόμενος στη μισθοδοσία'}
      icon={Users}
      headerStyle="bordered"
      size="xl"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={<ModalActions onCancel={onClose} isSaving={isSaving} disabled={!valid} />}
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="payroll-store" className="block text-xs font-bold text-slate-600 mb-1">
              Κατάστημα
            </label>
            <select id="payroll-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="payroll-unit" className="block text-xs font-bold text-slate-600 mb-1">
              Μονάδα
            </label>
            <select id="payroll-unit" value={unit} onChange={(e) => setUnit(e.target.value as PnlUnit)} className={inputClass}>
              <option value="STORE">Κατάστημα</option>
              <option value="FNB">F&B</option>
            </select>
          </div>
          <div>
            <label htmlFor="payroll-name" className="block text-xs font-bold text-slate-600 mb-1">
              Ονοματεπώνυμο
            </label>
            <input id="payroll-name" type="text" required maxLength={MAX_LABEL_LENGTH} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="payroll-email" className="block text-xs font-bold text-slate-600 mb-1">
              e-mail
            </label>
            <input id="payroll-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="payroll-iban" className="block text-xs font-bold text-slate-600 mb-1">
              IBAN
            </label>
            <input id="payroll-iban" type="text" value={iban} onChange={(e) => setIban(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold text-slate-500">Αποδοχές</p>
          {moneyGrid(PAY_FIELDS)}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="payroll-leave-days" className="block text-xs font-bold text-slate-600 mb-1">
                Άδεια Ληφθ. (ημέρες)
              </label>
              <input
                id="payroll-leave-days"
                type="text"
                inputMode="decimal"
                value={leaveDays}
                onChange={(e) => setLeaveDays(e.target.value)}
                placeholder="0"
                className={`${inputClass} text-right font-mono`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold text-slate-500">Πληρωμή</p>
          {moneyGrid(PAYOUT_FIELDS)}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3 tabular-nums">
          <div>
            <p className="text-xs font-bold text-slate-500">Σύνολο Μισθοδοσίας</p>
            <p className="text-lg font-black text-slate-900">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">Χέρι</p>
            <p className={`text-lg font-black ${cashInHand < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{formatCurrency(cashInHand)}</p>
          </div>
        </div>
        {cashInHand < 0 && (
          <p className="text-xs font-semibold text-rose-700">Το «Χέρι» βγαίνει αρνητικό: τράπεζα και προκαταβολή ξεπερνούν το σύνολο.</p>
        )}
        {error && <p className="font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
