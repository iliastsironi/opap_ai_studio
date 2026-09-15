import React, { useEffect, useState } from 'react';
import { Coins, Plus } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { PnlCommissionBatch } from '../../lib/pnlEngine.ts';
import { MoneyInput, isValidMoney, moneyInputValue, parseMoney } from './moneyInput.tsx';
import { defaultEntryDate, monthBounds } from './pnlDisplay.tsx';

interface CommissionEntryModalProps {
  isOpen: boolean;
  month: string;
  storeName: string;
  lines: string[];
  batch: PnlCommissionBatch | null;
  onClose: () => void;
  onSave: (entry: { entryDate: string; lines: Array<{ line: string; amount: number }>; note: string }) => Promise<void>;
}

// One Allwyn statement: a date plus an amount per commission line.
export const CommissionEntryModal: React.FC<CommissionEntryModalProps> = ({
  isOpen,
  month,
  storeName,
  lines,
  batch,
  onClose,
  onSave,
}) => {
  const [entryDate, setEntryDate] = useState('');
  const [rows, setRows] = useState<Array<{ line: string; value: string }>>([]);
  const [note, setNote] = useState('');
  const [newLine, setNewLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const names = [...lines, ...(batch?.lines.map((l) => l.line).filter((line) => !lines.includes(line)) ?? [])];
    setRows(names.map((line) => ({ line, value: moneyInputValue(batch?.lines.find((l) => l.line === line)?.amount ?? 0) })));
    setEntryDate(batch?.entryDate ?? defaultEntryDate(month));
    setNote(batch?.note ?? '');
    setNewLine('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const { min, max } = monthBounds(month);
  const allValid = rows.every((row) => isValidMoney(row.value, true));
  const hasAmount = rows.some((row) => (parseMoney(row.value) ?? 0) !== 0);
  const dateValid = entryDate >= min && entryDate <= max;
  const total = rows.reduce((sum, row) => sum + (parseMoney(row.value) ?? 0), 0);

  const addLine = () => {
    const line = newLine.trim();
    if (!line || rows.some((row) => row.line === line)) return;
    setRows([...rows, { line, value: '' }]);
    setNewLine('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid || !hasAmount || !dateValid) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ entryDate, lines: rows.map((row) => ({ line: row.line, amount: parseMoney(row.value) ?? 0 })), note });
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
      title={batch ? 'Επεξεργασία προμηθειών' : 'Νέα καταχώρηση προμηθειών'}
      subtitle={storeName}
      icon={Coins}
      headerStyle="bordered"
      size="lg"
      bodyAsForm
      onSubmit={handleSubmit}
      footer={<ModalActions onCancel={onClose} isSaving={isSaving} disabled={!allValid || !hasAmount || !dateValid} />}
    >
      <div className="space-y-4 text-sm">
        <div>
          <label htmlFor="commission-date" className="block text-xs font-bold text-slate-600 mb-1">
            Ημερομηνία εκκαθάρισης
          </label>
          <input
            id="commission-date"
            type="date"
            min={min}
            max={max}
            required
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {rows.map((row, index) => (
            <div key={row.line} className="flex items-center gap-3">
              <label htmlFor={`commission-line-${index}`} className="flex-1 font-semibold text-slate-800">
                {row.line}
              </label>
              <div className="w-32">
                <MoneyInput
                  id={`commission-line-${index}`}
                  allowNegative
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
            value={newLine}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setNewLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLine();
              }
            }}
            placeholder="Άλλη γραμμή προμήθειας"
            aria-label="Όνομα νέας γραμμής προμήθειας"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={addLine}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Προσθήκη
          </button>
        </div>

        <div>
          <label htmlFor="commission-note" className="block text-xs font-bold text-slate-600 mb-1">
            Σημείωση (προαιρετικό)
          </label>
          <input
            id="commission-note"
            type="text"
            value={note}
            maxLength={MAX_NOTES_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder="π.χ. Εκκαθάριση εβδομάδας 18–24/08"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-2">
          <span>Σύνολο καταχώρησης</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
        {!dateValid && entryDate && <p className="text-xs font-semibold text-rose-700">Η ημερομηνία πρέπει να ανήκει στον επιλεγμένο μήνα.</p>}
        {error && <p className="font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
