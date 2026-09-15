import React, { useState } from 'react';
import { Building2, Copy, Edit2, Landmark, Plus, Receipt, Trash2 } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import {
  DEFAULT_COMPANY_FIXED_LINES,
  DEFAULT_COMPANY_PAYEES,
  DEFAULT_LOAN_LINES,
  MonthlyPnlResult,
  NO_SUPPLIER_LABEL,
  PnlCompanyCost,
  PnlCompanyCostKind,
  PnlCompanyDailyExpense,
  monthLabel,
} from '../../lib/pnlEngine.ts';
import {
  addCompanyDailyExpense,
  copyCompanyCostsFromPreviousMonth,
  deleteCompanyDailyExpense,
  saveCompanyCosts,
} from '../../services/pnlService.ts';
import { AmountLinesModal } from './AmountLinesModal.tsx';
import { DayGridTable } from './DayGridTable.tsx';
import { MoneyInput, parseMoney } from './moneyInput.tsx';
import { PnlSection, defaultEntryDate, fullDay, iconAction, monthBounds, primaryAction, secondaryAction } from './pnlDisplay.tsx';

const LINE_EDITORS: Record<PnlCompanyCostKind, { title: string; defaults: string[] }> = {
  FIXED: { title: 'Πάγια Έξοδα Εταιρίας', defaults: DEFAULT_COMPANY_FIXED_LINES },
  LOAN: { title: 'Δάνεια', defaults: DEFAULT_LOAN_LINES },
};

const MAX_PAYEE_SHORTCUTS = 10;

const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

interface DailyExpenseModalProps {
  month: string;
  payees: string[];
  onClose: () => void;
  onSave: (entry: { expenseDate: string; payee: string; amount: number; note: string }) => Promise<void>;
}

const DailyExpenseModal: React.FC<DailyExpenseModalProps> = ({ month, payees, onClose, onSave }) => {
  const [expenseDate, setExpenseDate] = useState(() => defaultEntryDate(month));
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { min, max } = monthBounds(month);
  const parsedAmount = parseMoney(amount);
  const canSave = payee.trim() !== '' && parsedAmount !== null && parsedAmount > 0 && expenseDate >= min && expenseDate <= max;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || parsedAmount === null) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ expenseDate, payee: payee.trim(), amount: parsedAmount, note });
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
      title="Νέο έξοδο εταιρίας"
      subtitle={monthLabel(month)}
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
            <label htmlFor="company-expense-date" className="block text-xs font-bold text-slate-600 mb-1">
              Ημερομηνία
            </label>
            <input
              id="company-expense-date"
              type="date"
              min={min}
              max={max}
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="company-expense-amount" className="block text-xs font-bold text-slate-600 mb-1">
              Ποσό (€)
            </label>
            <MoneyInput id="company-expense-amount" value={amount} onChange={setAmount} />
          </div>
        </div>

        <div>
          <label htmlFor="company-expense-payee" className="block text-xs font-bold text-slate-600 mb-1">
            Δικαιούχος
          </label>
          <input
            id="company-expense-payee"
            type="text"
            list="pnl-company-payees"
            required
            value={payee}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="π.χ. ΚΑΥΣΙΜΑ"
            className={inputClass}
          />
          <datalist id="pnl-company-payees">
            {payees.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {payees.slice(0, MAX_PAYEE_SHORTCUTS).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setPayee(name)}
                aria-pressed={payee === name}
                className={`px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                  payee === name ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="company-expense-note" className="block text-xs font-bold text-slate-600 mb-1">
            Σημείωση (προαιρετικό)
          </label>
          <input
            id="company-expense-note"
            type="text"
            value={note}
            maxLength={MAX_NOTES_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};

interface CompanyExpensesSheetProps {
  result: MonthlyPnlResult;
  orgId: string;
  userId: string;
  onChanged: () => Promise<void>;
}

// The workbook's «ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ» sheet: company fixed costs, loans and a day × payee grid.
export const CompanyExpensesSheet: React.FC<CompanyExpensesSheetProps> = ({ result, orgId, userId, onChanged }) => {
  const { company, month } = result;
  const [editor, setEditor] = useState<{ open: boolean; kind: PnlCompanyCostKind }>({ open: false, kind: 'FIXED' });
  const [addingDaily, setAddingDaily] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<PnlCompanyDailyExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const payees = [...new Set([...DEFAULT_COMPANY_PAYEES, ...company.daily.columns.filter((column) => column !== NO_SUPPLIER_LABEL)])];

  const copyPreviousMonth = async () => {
    setIsCopying(true);
    setNotice(null);
    try {
      const copied = await copyCompanyCostsFromPreviousMonth(orgId, month);
      setNotice(
        copied > 0
          ? `${copied === 1 ? 'Αντιγράφηκε 1 γραμμή' : `Αντιγράφηκαν ${copied} γραμμές`} παγίων και δανείων από τον προηγούμενο μήνα.`
          : 'Δεν υπάρχουν νέες γραμμές παγίων ή δανείων στον προηγούμενο μήνα.'
      );
      await onChanged();
    } catch (err: any) {
      setNotice(err.message || 'Η αντιγραφή απέτυχε.');
    } finally {
      setIsCopying(false);
    }
  };

  const confirmDelete = async () => {
    if (!entryToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCompanyDailyExpense(entryToDelete.id);
      await onChanged();
      setEntryToDelete(null);
    } catch (err: any) {
      setNotice(err.message || 'Η διαγραφή απέτυχε.');
      setEntryToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const costTable = (rows: PnlCompanyCost[], total: number, emptyText: string) =>
    rows.length === 0 ? (
      <p className="text-sm text-slate-500">{emptyText}</p>
    ) : (
      <table className="w-full text-sm tabular-nums">
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="py-1.5 font-semibold text-slate-800">{row.name}</td>
              <td className="py-1.5 text-right text-slate-800">{formatCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-black text-slate-900 border-t-2 border-slate-200">
            <td className="py-2">Σύνολο</td>
            <td className="py-2 text-right">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    );

  const figures: Array<[string, number]> = [
    ['Πάγια εταιρίας', company.fixedTotal],
    ['Έξοδα ημέρας', company.daily.total],
    ['Σύνολο εξόδων εταιρίας', result.companyExpenses],
    ['Δάνεια', company.loansTotal],
  ];

  const editButton = (kind: PnlCompanyCostKind) => (
    <button type="button" className={primaryAction} onClick={() => setEditor({ open: true, kind })}>
      <Edit2 className="w-3.5 h-3.5" />
      Επεξεργασία
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 tabular-nums">
          {figures.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-bold text-slate-500">{label}</dt>
              <dd className="text-base font-black text-slate-900">{formatCurrency(value)}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className={`${secondaryAction} self-start lg:self-auto`} onClick={copyPreviousMonth} disabled={isCopying}>
          <Copy className="w-3.5 h-3.5" />
          Πάγια & δάνεια από προηγούμενο μήνα
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900">{notice}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <PnlSection
          title="Πάγια Έξοδα Εταιρίας"
          icon={Building2}
          aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(company.fixedTotal)}</span>}
          actions={editButton('FIXED')}
        >
          {costTable(company.fixed, company.fixedTotal, 'Δεν έχουν καταχωρηθεί πάγια εταιρίας για αυτόν τον μήνα.')}
        </PnlSection>
        <PnlSection
          title="Δάνεια"
          icon={Landmark}
          aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(company.loansTotal)}</span>}
          actions={editButton('LOAN')}
        >
          {costTable(company.loans, company.loansTotal, 'Δεν έχουν καταχωρηθεί δόσεις δανείων για αυτόν τον μήνα.')}
        </PnlSection>
      </div>

      <PnlSection
        title="Έξοδα Ημέρας Εταιρίας"
        icon={Receipt}
        subtitle="Πληρωμές ανά δικαιούχο, όπως στο φύλλο «ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ»"
        aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(company.daily.total)}</span>}
        actions={
          <button type="button" className={primaryAction} onClick={() => setAddingDaily(true)}>
            <Plus className="w-3.5 h-3.5" />
            Έξοδο
          </button>
        }
      >
        <div className="space-y-5">
          <DayGridTable grid={company.daily} emptyText="Δεν υπάρχουν έξοδα ημέρας εταιρίας για αυτόν τον μήνα." />
          {company.dailyEntries.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Καταχωρήσεις του μήνα</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Ημ/νια</th>
                      <th className="px-3 py-2 text-left font-bold">Δικαιούχος</th>
                      <th className="px-3 py-2 text-left font-bold">Σημείωση</th>
                      <th className="px-3 py-2 text-right font-bold">Ποσό</th>
                      <th className="px-2 py-2">
                        <span className="sr-only">Ενέργειες</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {company.dailyEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{fullDay(entry.expenseDate)}</td>
                        <td className="px-3 py-1.5 font-bold">{entry.payee}</td>
                        <td className="px-3 py-1.5 text-slate-500">{entry.note}</td>
                        <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">{formatCurrency(entry.amount)}</td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            aria-label={`Διαγραφή εξόδου: ${entry.payee} ${fullDay(entry.expenseDate)}`}
                            onClick={() => setEntryToDelete(entry)}
                            className={`${iconAction} hover:text-rose-600 hover:bg-rose-50`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </PnlSection>

      <AmountLinesModal
        isOpen={editor.open}
        title={LINE_EDITORS[editor.kind].title}
        subtitle={monthLabel(month)}
        icon={editor.kind === 'LOAN' ? Landmark : Building2}
        defaults={LINE_EDITORS[editor.kind].defaults}
        lines={editor.kind === 'LOAN' ? company.loans : company.fixed}
        onClose={() => setEditor((current) => ({ ...current, open: false }))}
        onSave={async (lines) => {
          await saveCompanyCosts(orgId, month, editor.kind, lines);
          await onChanged();
        }}
      />

      {addingDaily && (
        <DailyExpenseModal
          month={month}
          payees={payees}
          onClose={() => setAddingDaily(false)}
          onSave={async (entry) => {
            await addCompanyDailyExpense({ orgId, ...entry, userId });
            await onChanged();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={entryToDelete !== null}
        title="Διαγραφή εξόδου εταιρίας"
        message={entryToDelete ? `${entryToDelete.payee} · ${fullDay(entryToDelete.expenseDate)} · ${formatCurrency(entryToDelete.amount)}` : ''}
        confirmLabel="Διαγραφή"
        isLoading={isDeleting}
        loadingLabel="Διαγραφή..."
        onConfirm={confirmDelete}
        onCancel={() => setEntryToDelete(null)}
      />
    </div>
  );
};
