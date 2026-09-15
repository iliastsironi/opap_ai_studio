import React, { useState } from 'react';
import { AlertTriangle, Copy, Edit2, Plus, Trash2, Users } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MonthlyPnlResult, PnlPayrollComputedRow, PnlPayrollRow, monthLabel } from '../../lib/pnlEngine.ts';
import { copyPayrollFromPreviousMonth, deletePayrollRow, savePayrollRow } from '../../services/pnlService.ts';
import { PayrollRowModal } from './PayrollRowModal.tsx';
import { PnlSection, iconAction, primaryAction, secondaryAction } from './pnlDisplay.tsx';

const PAY_HEADERS = ['Μισθός', 'Αυξ. Μισθού', 'Υπερωρίες', 'Δώρο Χρ.', 'Επ. Αδείας', 'Άδεια (ημ.)', 'Αποζ. Αδείας', 'Bonus'];

const amount = (value: number): string => (value ? formatCurrency(value) : '');
const days = (value: number): string => (value ? String(value).replace('.', ',') : '');
const cell = 'px-3 py-2 text-right whitespace-nowrap';

interface PayrollSheetProps {
  result: MonthlyPnlResult;
  orgId: string;
  onChanged: () => Promise<void>;
}

// The workbook's «ΜΙΣΘΟΔΟΣΙΑ» sheet: one table per store and unit, totals computed rather than typed.
export const PayrollSheet: React.FC<PayrollSheetProps> = ({ result, orgId, onChanged }) => {
  const [editor, setEditor] = useState<{ open: boolean; row: PnlPayrollRow | null }>({ open: false, row: null });
  const [rowToDelete, setRowToDelete] = useState<PnlPayrollComputedRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const copyPreviousMonth = async () => {
    setIsCopying(true);
    setNotice(null);
    try {
      const copied = await copyPayrollFromPreviousMonth(orgId, result.month);
      setNotice(
        copied > 0
          ? `${copied === 1 ? 'Αντιγράφηκε 1 εργαζόμενος' : `Αντιγράφηκαν ${copied} εργαζόμενοι`} από τον προηγούμενο μήνα. Υπερωρίες, δώρα, άδειες, bonus και προκαταβολές ξεκινούν από 0.`
          : 'Δεν βρέθηκαν νέοι εργαζόμενοι στη μισθοδοσία του προηγούμενου μήνα.'
      );
      await onChanged();
    } catch (err: any) {
      setNotice(err.message || 'Η αντιγραφή απέτυχε.');
    } finally {
      setIsCopying(false);
    }
  };

  const confirmDelete = async () => {
    if (!rowToDelete?.id) return;
    setIsDeleting(true);
    try {
      await deletePayrollRow(rowToDelete.id);
      await onChanged();
      setRowToDelete(null);
    } catch (err: any) {
      setNotice(err.message || 'Η διαγραφή απέτυχε.');
      setRowToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900">{notice}</div>
      )}

      <PnlSection
        title="Μισθοδοσία"
        icon={Users}
        subtitle="Σύνολο = Μισθός + Αυξ. + Υπερωρίες + Δώρο + Επ. Αδείας + Αποζ. Αδείας + Bonus (οι ημέρες άδειας δεν προστίθενται) · Χέρι = Σύνολο − Τράπεζα − Προκαταβολή"
        aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(result.payrollTotal)}</span>}
        actions={
          <>
            <button type="button" className={secondaryAction} onClick={copyPreviousMonth} disabled={isCopying}>
              <Copy className="w-3.5 h-3.5" />
              Από προηγούμενο μήνα
            </button>
            <button type="button" className={primaryAction} onClick={() => setEditor({ open: true, row: null })}>
              <Plus className="w-3.5 h-3.5" />
              Εργαζόμενος
            </button>
          </>
        }
      >
        {result.payroll.length === 0 ? (
          <p className="text-sm text-slate-500">
            Δεν υπάρχει μισθοδοσία για αυτόν τον μήνα. Αντιγράψτε τον προηγούμενο μήνα ή προσθέστε εργαζόμενο.
          </p>
        ) : (
          <div className="space-y-6">
            {result.payroll.map((group) => (
              <div key={group.key} className="space-y-2">
                <h4 className="text-sm font-extrabold text-slate-800">{group.label}</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Ονοματεπώνυμο</th>
                        {PAY_HEADERS.map((header) => (
                          <th key={header} className="px-3 py-2 text-right font-bold whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right font-black whitespace-nowrap">Σύνολο</th>
                        <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Τράπεζα</th>
                        <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Προκαταβολή</th>
                        <th className="px-3 py-2 text-right font-black whitespace-nowrap">Χέρι</th>
                        <th className="px-2 py-2">
                          <span className="sr-only">Ενέργειες</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {group.rows.map((row) => (
                        <tr key={row.id ?? `${group.key}:${row.name}`}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-bold text-slate-900">{row.name}</span>
                            {row.email && <span className="block text-[11px] text-slate-500">{row.email}</span>}
                          </td>
                          <td className={cell}>{amount(row.baseSalary)}</td>
                          <td className={cell}>{amount(row.salaryIncrease)}</td>
                          <td className={cell}>{amount(row.overtimeAmount)}</td>
                          <td className={cell}>{amount(row.christmasBonus)}</td>
                          <td className={cell}>{amount(row.holidayAllowance)}</td>
                          <td className={cell}>{days(row.leaveDaysTaken)}</td>
                          <td className={cell}>{amount(row.leaveCompensation)}</td>
                          <td className={cell}>{amount(row.bonus)}</td>
                          <td className={`${cell} font-bold text-slate-900`}>{formatCurrency(row.total)}</td>
                          <td className={cell}>{amount(row.bankAmount)}</td>
                          <td className={cell}>{amount(row.advancePayment)}</td>
                          <td className={`${cell} font-black ${row.cashInHand < 0 ? 'bg-rose-50 text-rose-700' : 'text-slate-900'}`}>
                            {row.cashInHand < 0 && <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden="true" />}
                            {formatCurrency(row.cashInHand)}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-right">
                            <button
                              type="button"
                              aria-label={`Επεξεργασία: ${row.name}`}
                              onClick={() => setEditor({ open: true, row })}
                              className={`${iconAction} hover:text-indigo-600 hover:bg-indigo-50`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Διαγραφή: ${row.name}`}
                              onClick={() => setRowToDelete(row)}
                              className={`${iconAction} hover:text-rose-600 hover:bg-rose-50`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black text-slate-900">
                      <tr>
                        <td className="px-3 py-2" colSpan={1 + PAY_HEADERS.length}>
                          Σύνολο
                        </td>
                        <td className={cell}>{formatCurrency(group.total)}</td>
                        <td className={cell}>{formatCurrency(group.bank)}</td>
                        <td className={cell}>{formatCurrency(group.advance)}</td>
                        <td className={`${cell} ${group.cashInHand < 0 ? 'text-rose-700' : ''}`}>{formatCurrency(group.cashInHand)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </PnlSection>

      <PayrollRowModal
        isOpen={editor.open}
        month={result.month}
        stores={result.stores.map((sheet) => sheet.store)}
        row={editor.row}
        onClose={() => setEditor((current) => ({ ...current, open: false }))}
        onSave={async (row, storeName) => {
          await savePayrollRow(orgId, result.month, row, storeName);
          await onChanged();
        }}
      />

      <ConfirmDialog
        isOpen={rowToDelete !== null}
        title="Διαγραφή από τη μισθοδοσία"
        message={rowToDelete ? `${rowToDelete.name} · ${monthLabel(result.month)} · ${formatCurrency(rowToDelete.total)}` : ''}
        confirmLabel="Διαγραφή"
        isLoading={isDeleting}
        loadingLabel="Διαγραφή..."
        onConfirm={confirmDelete}
        onCancel={() => setRowToDelete(null)}
      />
    </div>
  );
};
