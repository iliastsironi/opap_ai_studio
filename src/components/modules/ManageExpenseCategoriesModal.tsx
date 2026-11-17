import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Tags } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';
import { sortCategories, type ExpenseCategoryDef, type ExpenseSide } from '../../lib/expenseCategories.ts';
import { canChangeSide, canHideCategory, categoryLabelProblem, moveCategory } from '../../lib/expenseCategoryEdit.ts';
import { reorderExpenseCategories, updateExpenseCategory } from '../../services/pnlService.ts';

interface ManageExpenseCategoriesModalProps {
  categories: ExpenseCategoryDef[];
  onClose: () => void;
  /** Μετά από κάθε αλλαγή: η λίστα ξαναφορτώνεται, ώστε ό,τι φαίνεται να είναι ό,τι είναι στη βάση. */
  onChanged: () => void;
}

const SIDES: Array<[ExpenseSide, string]> = [
  ['AGENCY', 'Πρακτορείο'],
  ['FNB', 'Καφές (F&B)'],
  ['COMPANY', 'Εταιρία'],
];

/**
 * Η λίστα των κατηγοριών εξόδων, για να τις διορθώνει ο υπεύθυνος: όνομα, σειρά, ορατότητα,
 * και (μόνο στις δικές του) η πλευρά. Οι κανόνες ζουν στο lib/expenseCategoryEdit.ts.
 *
 * Το όνομα αποθηκεύεται όταν φεύγει ο κέρσορας από το πεδίο. Αλλάζει μόνο το όνομα που φαίνεται,
 * όχι το key που είναι γραμμένο μέσα στα έξοδα, οπότε τα παλιά έξοδα παίρνουν αμέσως το νέο όνομα.
 */
export const ManageExpenseCategoriesModal: React.FC<ManageExpenseCategoriesModalProps> = ({
  categories,
  onClose,
  onChanged,
}) => {
  const ordered = sortCategories(categories);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setError = (id: string, message: string | null) =>
    setErrors((prev) => {
      const { [id]: _gone, ...rest } = prev;
      return message ? { ...rest, [id]: message } : rest;
    });

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setGlobalError(null);
    try {
      await action();
      onChanged();
    } catch (e: any) {
      setError(id, e?.message || 'Η αλλαγή δεν αποθηκεύτηκε.');
    } finally {
      setBusyId(null);
    }
  };

  const commitLabel = (c: ExpenseCategoryDef) => {
    const typed = drafts[c.id!];
    if (typed === undefined) return;
    const problem = categoryLabelProblem(typed, c.id, categories);
    if (typed.trim() === c.label.trim()) {
      setDrafts(({ [c.id!]: _d, ...rest }) => rest);
      setError(c.id!, null);
      return;
    }
    if (problem) {
      setError(c.id!, problem);
      return;
    }
    setError(c.id!, null);
    void run(c.id!, async () => {
      await updateExpenseCategory(c.id!, { label: typed });
      setDrafts(({ [c.id!]: _d, ...rest }) => rest);
    });
  };

  const move = (c: ExpenseCategoryDef, delta: -1 | 1) => {
    const changes = moveCategory(categories, c.id!, delta);
    if (changes.length === 0) return;
    void run(c.id!, () => reorderExpenseCategories(changes));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Κατηγορίες εξόδων"
      icon={Tags}
      headerStyle="bordered"
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm cursor-pointer hover:bg-slate-800"
        >
          Κλείσιμο
        </button>
      }
    >
      <div className="space-y-3 text-sm" data-testid="manage-expense-categories">
        <p className="text-xs text-slate-500">
          Αλλάξτε το όνομα, τη σειρά ή κρύψτε όσες δεν χρησιμοποιείτε. Το νέο όνομα φαίνεται αμέσως και στα
          παλιά έξοδα. Μια κρυμμένη κατηγορία δεν προτείνεται για νέα έξοδα, αλλά τα παλιά της έξοδα μένουν.
        </p>

        {globalError && <p className="text-xs font-bold text-rose-700">{globalError}</p>}

        <ul className="space-y-2">
          {ordered.map((c, index) => {
            const id = c.id ?? c.key;
            const value = drafts[id] ?? c.label;
            const error = errors[id];
            const busy = busyId === c.id;
            const canHide = canHideCategory(categories, c.id);
            return (
              <li
                key={id}
                data-category-key={c.key}
                className={`p-3 rounded-xl border space-y-2 ${c.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(c, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Μετακίνηση της ${c.label} πιο πάνω`}
                      className="p-0.5 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(c, 1)}
                      disabled={busy || index === ordered.length - 1}
                      aria-label={`Μετακίνηση της ${c.label} πιο κάτω`}
                      className="p-0.5 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={value}
                    maxLength={MAX_LABEL_LENGTH}
                    disabled={busy}
                    aria-label={`Όνομα κατηγορίας ${c.label}`}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                    onBlur={() => commitLabel(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className={`flex-1 min-w-0 px-3 py-2 rounded-xl border bg-white text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-brand ${
                      error ? 'border-rose-400' : 'border-slate-300'
                    } ${c.isActive ? 'text-slate-900' : 'text-slate-400'}`}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      void run(c.id!, () => updateExpenseCategory(c.id!, { isActive: !c.isActive }))
                    }
                    disabled={busy || (c.isActive && !canHide)}
                    aria-pressed={!c.isActive}
                    aria-label={c.isActive ? `Απόκρυψη της κατηγορίας ${c.label}` : `Εμφάνιση της κατηγορίας ${c.label}`}
                    title={
                      c.isActive
                        ? canHide
                          ? 'Ορατή. Πατήστε για να κρυφτεί από τα νέα έξοδα (τα παλιά μένουν).'
                          : 'Είναι η μόνη ορατή: πρέπει να μείνει τουλάχιστον μία.'
                        : 'Κρυμμένη. Πατήστε για να ξαναεμφανιστεί.'
                    }
                    className={`p-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                      c.isActive
                        ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-slate-300 bg-slate-200 text-slate-500 hover:bg-slate-300'
                    }`}
                  >
                    {c.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap pl-8">
                  {canChangeSide(c) ? (
                    <label className="flex items-center gap-1.5 text-micro font-bold text-slate-600">
                      Ανήκει στο
                      <select
                        value={c.side}
                        disabled={busy}
                        aria-label={`Πλευρά της κατηγορίας ${c.label}`}
                        onChange={(e) => void run(c.id!, () => updateExpenseCategory(c.id!, { side: e.target.value as ExpenseSide }))}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-micro font-bold text-slate-800 cursor-pointer"
                      >
                        {SIDES.map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-micro font-bold text-slate-500"
                      title="Οι ενσωματωμένες κατηγορίες έχουν σταθερή πλευρά: από αυτήν κρίνεται πού μετράνε στο P&L."
                    >
                      <Lock aria-hidden="true" className="w-3 h-3" />
                      {SIDES.find(([v]) => v === c.side)?.[1]} · σταθερή
                    </span>
                  )}
                  {!c.isActive && <span className="text-micro font-bold text-slate-500">Κρυμμένη στα νέα έξοδα</span>}
                </div>

                {canChangeSide(c) && (
                  <p className="pl-8 text-micro text-slate-500">
                    Η αλλαγή πλευράς αλλάζει και τα παλιά έξοδα αυτής της κατηγορίας στο P&L.
                  </p>
                )}
                {error && <p className="pl-8 text-micro font-bold text-rose-700">{error}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
