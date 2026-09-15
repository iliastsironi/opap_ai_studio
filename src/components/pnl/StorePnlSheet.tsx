import React, { useState } from 'react';
import { Banknote, Building2, Coffee, Coins, Copy, Edit2, Plus, Receipt, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import {
  DEFAULT_FIXED_COST_LINES,
  MonthlyPnlResult,
  NO_SUPPLIER_LABEL,
  PnlCommissionBatch,
  PnlDayGrid,
  monthLabel,
  weekdayLabel,
} from '../../lib/pnlEngine.ts';
import { copyFixedCostsFromPreviousMonth, deleteCommissionBatch, saveCommissionBatch, saveFixedCosts } from '../../services/pnlService.ts';
import { AddExpenseModal } from './AddExpenseModal.tsx';
import { AmountLinesModal } from './AmountLinesModal.tsx';
import { CommissionEntryModal } from './CommissionEntryModal.tsx';
import { DayGridTable } from './DayGridTable.tsx';
import { PnlSection, fullDay, iconAction, primaryAction, secondaryAction, shortDay } from './pnlDisplay.tsx';

const FNB_SOURCE_LABEL = { SHIFTS: 'Βάρδιες', MANUAL: 'Χειροκίνητο', NONE: '' } as const;

const sumOf = (values: number[]): number => Math.round(values.reduce((acc, value) => acc + value, 0) * 100) / 100;
const supplierOptions = (grid: PnlDayGrid): string[] => grid.columns.filter((column) => column !== NO_SUPPLIER_LABEL);

interface StorePnlSheetProps {
  result: MonthlyPnlResult;
  orgId: string;
  userId: string;
  userName?: string;
  storeId: string | null;
  onStoreChange: (storeId: string) => void;
  onChanged: () => Promise<void>;
}

// One store for one month, laid out like a store sheet of the workbook.
export const StorePnlSheet: React.FC<StorePnlSheetProps> = ({ result, orgId, userId, userName, storeId, onStoreChange, onChanged }) => {
  const [commissionEditor, setCommissionEditor] = useState<{ open: boolean; batch: PnlCommissionBatch | null }>({
    open: false,
    batch: null,
  });
  const [fixedModalOpen, setFixedModalOpen] = useState(false);
  const [expenseModal, setExpenseModal] = useState<'STORE' | 'FNB' | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<PnlCommissionBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllFnbDays, setShowAllFnbDays] = useState(false);

  const fallbackStoreId = (result.units.find((unit) => unit.hasActivity) ?? result.units[0])?.storeId;
  const sheet = result.stores.find((s) => s.store.id === storeId) ?? result.stores.find((s) => s.store.id === fallbackStoreId);

  if (!sheet) {
    return <p className="text-sm text-slate-500">Δεν υπάρχουν καταστήματα.</p>;
  }

  const { store, fnb } = sheet;
  const month = result.month;
  const storeUnit = result.units.find((unit) => unit.key === `${store.id}:STORE`);
  const fnbUnit = result.units.find((unit) => unit.key === `${store.id}:FNB`);
  const fnbRows = fnb ? (showAllFnbDays ? fnb.days : fnb.days.filter((day) => day.turnover !== 0 || day.expenses !== 0)) : [];
  const cashRows = sheet.cash.filter((day) => day.hasData);
  const vltRows = cashRows.filter((day) => day.vltCounted !== null);

  const copyFixedCosts = async () => {
    setIsCopying(true);
    setNotice(null);
    try {
      const copied = await copyFixedCostsFromPreviousMonth(orgId, store.id, month);
      setNotice(
        copied > 0
          ? `${copied === 1 ? 'Αντιγράφηκε 1 γραμμή' : `Αντιγράφηκαν ${copied} γραμμές`} παγίων από τον προηγούμενο μήνα.`
          : 'Δεν υπάρχουν νέες γραμμές παγίων στον προηγούμενο μήνα.'
      );
      await onChanged();
    } catch (err: any) {
      setNotice(err.message || 'Η αντιγραφή απέτυχε.');
    } finally {
      setIsCopying(false);
    }
  };

  const confirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCommissionBatch(batchToDelete.batchId);
      await onChanged();
      setBatchToDelete(null);
    } catch (err: any) {
      setNotice(err.message || 'Η διαγραφή απέτυχε.');
      setBatchToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const figures: Array<[string, number | undefined]> = [
    ['Τζίρος', storeUnit?.revenue],
    ['Έξοδα ημέρας', storeUnit?.dailyExpenses],
    ['Πάγια', storeUnit?.fixedCosts],
    ['Μισθοδοσία', storeUnit?.payroll],
    ['Αποτέλεσμα', storeUnit?.result],
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <label htmlFor="pnl-store" className="block text-xs font-bold text-slate-500 mb-1">
              Κατάστημα
            </label>
            <select
              id="pnl-store"
              value={store.id}
              onChange={(e) => {
                onStoreChange(e.target.value);
                setNotice(null);
              }}
              className="max-w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              {result.stores.map((s) => {
                const active = result.units.some((unit) => unit.storeId === s.store.id && unit.hasActivity);
                return (
                  <option key={s.store.id} value={s.store.id}>
                    {s.store.name}
                    {active ? '' : ' (χωρίς κινήσεις)'}
                  </option>
                );
              })}
            </select>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-2 tabular-nums">
            {figures.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-bold text-slate-500">{label}</dt>
                <dd
                  className={`text-base font-black ${
                    label === 'Αποτέλεσμα' ? ((value ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700') : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(value ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {fnbUnit && (
          <p className="text-sm text-slate-600 border-t border-slate-100 pt-3 tabular-nums">
            <span className="font-bold text-slate-800">F&B:</span> τζίρος {formatCurrency(fnbUnit.revenue)} · έξοδα{' '}
            {formatCurrency(fnbUnit.dailyExpenses)} · μισθοδοσία {formatCurrency(fnbUnit.payroll)} ·{' '}
            <span className={`font-black ${fnbUnit.result < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              αποτέλεσμα {formatCurrency(fnbUnit.result)}
            </span>
          </p>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900">{notice}</div>
      )}

      <PnlSection
        title="Προμήθειες"
        icon={Coins}
        subtitle="Από τις εκκαθαρίσεις Allwyn, 1–2 φορές την εβδομάδα"
        aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(sheet.commissions.total)}</span>}
        actions={
          <button type="button" className={primaryAction} onClick={() => setCommissionEditor({ open: true, batch: null })}>
            <Plus className="w-3.5 h-3.5" />
            Νέα καταχώρηση
          </button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <table className="w-full text-sm tabular-nums">
            <tbody className="divide-y divide-slate-100">
              {sheet.commissions.lines.map((line) => (
                <tr key={line.line} className={line.total === 0 ? 'text-slate-400' : 'text-slate-800'}>
                  <td className="py-1.5 font-semibold">{line.line}</td>
                  <td className="py-1.5 text-right">{formatCurrency(line.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-black text-slate-900 border-t-2 border-slate-200">
                <td className="py-2">Σύνολο μήνα</td>
                <td className="py-2 text-right">{formatCurrency(sheet.commissions.total)}</td>
              </tr>
            </tfoot>
          </table>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Καταχωρήσεις του μήνα</p>
            {sheet.commissions.batches.length === 0 ? (
              <p className="text-sm text-slate-500">Καμία καταχώρηση ακόμη.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {sheet.commissions.batches.map((batch) => (
                  <li key={batch.batchId} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{fullDay(batch.entryDate)}</p>
                      <p className="text-xs text-slate-600 break-words">
                        {batch.lines.map((line) => `${line.line} ${formatCurrency(line.amount)}`).join(' · ')}
                      </p>
                      {batch.note && <p className="text-xs text-slate-500 italic mt-0.5">{batch.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-black text-slate-900 tabular-nums mr-1">{formatCurrency(batch.total)}</span>
                      <button
                        type="button"
                        aria-label={`Επεξεργασία καταχώρησης ${fullDay(batch.entryDate)}`}
                        onClick={() => setCommissionEditor({ open: true, batch })}
                        className={`${iconAction} hover:text-indigo-600 hover:bg-indigo-50`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Διαγραφή καταχώρησης ${fullDay(batch.entryDate)}`}
                        onClick={() => setBatchToDelete(batch)}
                        className={`${iconAction} hover:text-rose-600 hover:bg-rose-50`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PnlSection>

      <PnlSection
        title="Πάγια Έξοδα"
        icon={Building2}
        aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(sheet.fixedCosts.total)}</span>}
        actions={
          <>
            <button type="button" className={secondaryAction} onClick={copyFixedCosts} disabled={isCopying}>
              <Copy className="w-3.5 h-3.5" />
              Από προηγούμενο μήνα
            </button>
            <button type="button" className={primaryAction} onClick={() => setFixedModalOpen(true)}>
              <Edit2 className="w-3.5 h-3.5" />
              Επεξεργασία
            </button>
          </>
        }
      >
        {sheet.fixedCosts.lines.length === 0 ? (
          <p className="text-sm text-slate-500">Δεν έχουν καταχωρηθεί πάγια για αυτόν τον μήνα.</p>
        ) : (
          <table className="w-full max-w-lg text-sm tabular-nums">
            <tbody className="divide-y divide-slate-100">
              {sheet.fixedCosts.lines.map((line) => (
                <tr key={line.name}>
                  <td className="py-1.5 font-semibold text-slate-800">{line.name}</td>
                  <td className="py-1.5 text-right text-slate-800">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-black text-slate-900 border-t-2 border-slate-200">
                <td className="py-2">Σύνολο</td>
                <td className="py-2 text-right">{formatCurrency(sheet.fixedCosts.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </PnlSection>

      <PnlSection
        title="Έξοδα Ημέρας"
        icon={Receipt}
        subtitle="Από τα έξοδα που καταχωρούνται στις βάρδιες και στην ενότητα Εξόδων"
        aside={<span className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(sheet.dailyExpenses.total)}</span>}
        actions={
          <button type="button" className={primaryAction} onClick={() => setExpenseModal('STORE')}>
            <Plus className="w-3.5 h-3.5" />
            Έξοδο
          </button>
        }
      >
        <DayGridTable grid={sheet.dailyExpenses} emptyText="Δεν υπάρχουν έξοδα ημέρας για αυτόν τον μήνα." />
      </PnlSection>

      {fnb && (
        <PnlSection
          title="F&B"
          icon={Coffee}
          subtitle="Μετρητά και POS από τις βάρδιες · έξοδα με κατηγορία «Έξοδα FnB»"
          aside={
            <span className={`text-sm font-black tabular-nums ${fnb.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              Ταμείο {formatCurrency(fnb.net)}
            </span>
          }
          actions={
            <button type="button" className={primaryAction} onClick={() => setExpenseModal('FNB')}>
              <Plus className="w-3.5 h-3.5" />
              Έξοδο F&B
            </button>
          }
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Ημ/νια</th>
                      <th className="px-3 py-2 text-right font-bold">Μετρητά</th>
                      <th className="px-3 py-2 text-right font-bold">POS</th>
                      <th className="px-3 py-2 text-right font-bold">Τζίρος</th>
                      <th className="px-3 py-2 text-right font-bold">Έξοδα</th>
                      <th className="px-3 py-2 text-right font-black">Ταμείο</th>
                      <th className="px-3 py-2 text-left font-bold">Πηγή</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fnbRows.map((day) => (
                      <tr key={day.date} className={day.turnover === 0 && day.expenses === 0 ? 'text-slate-300' : 'text-slate-800'}>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className="font-semibold">{shortDay(day.date)}</span> <span className="text-slate-400">{weekdayLabel(day.date)}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(day.cash)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(day.pos)}</td>
                        <td className="px-3 py-1.5 text-right font-bold">{formatCurrency(day.turnover)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(day.expenses)}</td>
                        <td className={`px-3 py-1.5 text-right font-black ${day.net < 0 ? 'text-rose-700' : ''}`}>{formatCurrency(day.net)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{FNB_SOURCE_LABEL[day.source]}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black text-slate-900">
                    <tr>
                      <td className="px-3 py-2">Σύνολο</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(fnb.cash)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(fnb.pos)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(fnb.turnover)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(fnb.expensesTotal)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(fnb.net)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setShowAllFnbDays((value) => !value)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {showAllFnbDays ? 'Μόνο ημέρες με κινήσεις' : 'Όλες οι ημέρες του μήνα'}
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Έξοδα F&B ανά προμηθευτή</p>
              <DayGridTable grid={fnb.expenses} emptyText="Δεν υπάρχουν έξοδα F&B αυτόν τον μήνα." />
            </div>
          </div>
        </PnlSection>
      )}

      <PnlSection title="Διαχείριση Ταμείου" icon={Banknote} subtitle="Από τις κλεισμένες βάρδιες και τις εκκαθαρίσεις VLTs">
        {cashRows.length === 0 ? (
          <p className="text-sm text-slate-500">Δεν υπάρχουν κλεισμένες βάρδιες ή εκκαθαρίσεις VLTs για αυτόν τον μήνα.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Ημ/νια</th>
                  <th className="px-3 py-2 text-left font-bold">Εργαζόμενοι</th>
                  <th className="px-3 py-2 text-right font-bold">Ταμείο</th>
                  <th className="px-3 py-2 text-right font-bold">Διαφορά ταμείου</th>
                  <th className="px-3 py-2 text-right font-bold">Προσαυξήσεις</th>
                  <th className="px-3 py-2 text-right font-bold">Καταμέτρηση VLTs</th>
                  <th className="px-3 py-2 text-right font-bold">Allwynnet</th>
                  <th className="px-3 py-2 text-right font-bold">Διαφορά VLTs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {cashRows.map((day) => (
                  <tr key={day.date}>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="font-semibold">{shortDay(day.date)}</span> <span className="text-slate-400">{weekdayLabel(day.date)}</span>
                    </td>
                    <td className="px-3 py-1.5">{day.employees.join(', ')}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(day.counted)}</td>
                    <td
                      className={`px-3 py-1.5 text-right font-bold ${
                        day.discrepancy < 0 ? 'text-rose-700' : day.discrepancy > 0 ? 'text-emerald-700' : ''
                      }`}
                    >
                      {formatCurrency(day.discrepancy, { showSign: true })}
                    </td>
                    <td className="px-3 py-1.5 text-right">{day.topUps ? formatCurrency(day.topUps) : ''}</td>
                    <td className="px-3 py-1.5 text-right">{day.vltCounted === null ? '' : formatCurrency(day.vltCounted)}</td>
                    <td className="px-3 py-1.5 text-right">{day.vltAllwynnet === null ? '' : formatCurrency(day.vltAllwynnet)}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${(day.vltDifference ?? 0) < 0 ? 'text-rose-700' : ''}`}>
                      {day.vltDifference === null ? '' : formatCurrency(day.vltDifference, { showSign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-black text-slate-900">
                <tr>
                  {/* A till count is a balance, not a flow - summing it over the month means nothing. */}
                  <td className="px-3 py-2" colSpan={3}>
                    Σύνολο μήνα
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(sumOf(cashRows.map((day) => day.discrepancy)), { showSign: true })}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(sumOf(cashRows.map((day) => day.topUps)))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(sumOf(vltRows.map((day) => day.vltCounted ?? 0)))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(sumOf(vltRows.map((day) => day.vltAllwynnet ?? 0)))}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(sumOf(vltRows.map((day) => day.vltDifference ?? 0)), { showSign: true })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PnlSection>

      <CommissionEntryModal
        isOpen={commissionEditor.open}
        month={month}
        storeName={store.name}
        lines={sheet.commissions.lines.map((line) => line.line)}
        batch={commissionEditor.batch}
        onClose={() => setCommissionEditor((current) => ({ ...current, open: false }))}
        onSave={async (entry) => {
          await saveCommissionBatch({
            orgId,
            storeId: store.id,
            entryDate: entry.entryDate,
            lines: entry.lines,
            note: entry.note,
            replacesBatchId: commissionEditor.batch?.batchId,
            userId,
          });
          await onChanged();
        }}
      />

      <AmountLinesModal
        isOpen={fixedModalOpen}
        title="Πάγια Έξοδα"
        subtitle={`${store.name} · ${monthLabel(month)}`}
        icon={Building2}
        defaults={DEFAULT_FIXED_COST_LINES}
        lines={sheet.fixedCosts.lines}
        onClose={() => setFixedModalOpen(false)}
        onSave={async (lines) => {
          await saveFixedCosts(orgId, store.id, month, lines);
          await onChanged();
        }}
      />

      {expenseModal && (
        <AddExpenseModal
          month={month}
          orgId={orgId}
          storeId={store.id}
          storeName={store.name}
          kind={expenseModal}
          suppliers={expenseModal === 'FNB' ? (fnb ? supplierOptions(fnb.expenses) : []) : supplierOptions(sheet.dailyExpenses)}
          userId={userId}
          userName={userName}
          onClose={() => setExpenseModal(null)}
          onSaved={onChanged}
        />
      )}

      <ConfirmDialog
        isOpen={batchToDelete !== null}
        title="Διαγραφή καταχώρησης προμηθειών"
        message={batchToDelete ? `${store.name} · ${fullDay(batchToDelete.entryDate)} · ${formatCurrency(batchToDelete.total)}` : ''}
        confirmLabel="Διαγραφή"
        isLoading={isDeleting}
        loadingLabel="Διαγραφή..."
        onConfirm={confirmDeleteBatch}
        onCancel={() => setBatchToDelete(null)}
      />
    </div>
  );
};
