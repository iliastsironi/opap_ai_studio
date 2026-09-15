import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { MoneyInput, isValidMoney, moneyInputValue, parseMoney } from './moneyInput.tsx';

interface AmountLinesModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  defaults: string[];
  lines: Array<{ name: string; amount: number }>;
  onClose: () => void;
  onSave: (lines: Array<{ name: string; amount: number }>) => Promise<void>;
}

// Monthly amounts per named line (fixed costs, company costs, loans).
export const AmountLinesModal: React.FC<AmountLinesModalProps> = ({
  isOpen,
  title,
  subtitle,
  icon,
  defaults,
  lines,
  onClose,
  onSave,
}) => {
  const [rows, setRows] = useState<Array<{ name: string; value: string }>>([]);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const names = [...defaults, ...lines.map((line) => line.name).filter((name) => !defaults.includes(name))];
    setRows(names.map((name) => ({ name, value: moneyInputValue(lines.find((line) => line.name === name)?.amount ?? 0) })));
    setNewName('');
    setError(null);
    // Reset only when the modal opens - a background reload must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const allValid = rows.every((row) => isValidMoney(row.value));
  const total = rows.reduce((sum, row) => sum + (parseMoney(row.value) ?? 0), 0);

  const addLine = () => {
    const name = newName.trim();
    if (!name || rows.some((row) => row.name === name)) return;
    setRows([...rows, { name, value: '' }]);
    setNewName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(rows.map((row) => ({ name: row.name, amount: parseMoney(row.value) ?? 0 })));
      onClose();
    } catch (err: any) {
      setError(err.message || 'Η αποθήκευση απέτυχε.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      headerStyle="bordered"
      size="md"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={<ModalActions onCancel={onClose} isSaving={isSaving} disabled={!allValid} />}
    >
      <div className="space-y-3">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row, index) => (
            <div key={row.name} className="flex items-center gap-3 px-3 py-2">
              <label htmlFor={`amount-line-${index}`} className="flex-1 text-sm font-semibold text-slate-800">
                {row.name}
              </label>
              <div className="w-36">
                <MoneyInput
                  id={`amount-line-${index}`}
                  value={row.value}
                  onChange={(value) => setRows(rows.map((r, i) => (i === index ? { ...r, value } : r)))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLine();
              }
            }}
            placeholder="Νέα γραμμή, π.χ. Λογιστής"
            aria-label="Όνομα νέας γραμμής"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={addLine}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Προσθήκη
          </button>
        </div>

        <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2">
          <span>Σύνολο</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-slate-500">Κενό πεδίο ή 0 αφαιρεί τη γραμμή από τον μήνα.</p>
        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
