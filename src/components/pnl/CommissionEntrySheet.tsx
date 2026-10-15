import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Receipt, Save, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { COMMISSION_ENTITIES, currentMonthKey, monthLabel, shiftMonthKey } from '../../lib/pnlEngine.ts';
import { monthEndDate, saveMonthlyCommissions } from '../../services/pnlService.ts';
import { useMonthlyPnl } from './useMonthlyPnl.ts';
import { MoneyInput, moneyInputValue, parseMoney } from './moneyInput.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { IconButton } from '../ui/IconButton.tsx';

// Keyed by `${storeId}::${entity}` so one flat object holds every field on the
// page without nesting a map inside a map.
type Draft = Record<string, string>;
const key = (storeId: string, entity: string) => `${storeId}::${entity}`;

export const CommissionEntrySheet: React.FC = () => {
  const { user, organization } = useAuth();
  const { stores } = useTenant();
  const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard
  const [month, setMonth] = useState(() => currentMonthKey());
  const { data, error: loadError, reload } = useMonthlyPnl(month);

  const [draft, setDraft] = useState<Draft>({});
  const [savingStore, setSavingStore] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Existing figures come off the computed sheets rather than a second query -
  // the engine already groups each store's commissions by line.
  useEffect(() => {
    const next: Draft = {};
    for (const sheet of data?.result.stores ?? []) {
      for (const entity of COMMISSION_ENTITIES) {
        const found = sheet.commissions.lines.find((l) => l.line === entity);
        next[key(sheet.store.id, entity)] = found && found.total !== 0 ? moneyInputValue(found.total) : '';
      }
    }
    setDraft(next);
  }, [data, month]);

  // Clearing «Αποθηκεύτηκε» belongs to changing month, not to loading data.
  // It used to sit in the effect above, which re-runs when reload() brings the
  // saved figures back - so the confirmation was wiped in the same tick it was
  // set and never appeared at all.
  useEffect(() => {
    setSaved(null);
  }, [month]);

  const storeTotal = (storeId: string) =>
    COMMISSION_ENTITIES.reduce((sum, e) => sum + (parseMoney(draft[key(storeId, e)] ?? '') ?? 0), 0);

  const companyTotal = useMemo(
    () => stores.reduce((sum, s) => sum + storeTotal(s.id), 0),
    [stores, draft]
  );

  const storeHasInvalid = (storeId: string) =>
    COMMISSION_ENTITIES.some((e) => {
      const raw = draft[key(storeId, e)] ?? '';
      return raw.trim() !== '' && parseMoney(raw) === null;
    });

  const save = async (storeId: string) => {
    setSavingStore(storeId);
    setError(null);
    setSaved(null);
    try {
      await saveMonthlyCommissions({
        orgId,
        storeId,
        entryDate: monthEndDate(month),
        // A blank field is written as 0 rather than skipped: three rows present
        // is what marks the month as reported.
        values: COMMISSION_ENTITIES.map((line) => ({
          line,
          amount: parseMoney(draft[key(storeId, line)] ?? '') ?? 0,
        })),
        note: 'Μηνιαίο report Allwyn',
        userId: user?.id,
      });
      setSaved(storeId);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Η αποθήκευση απέτυχε');
    } finally {
      setSavingStore(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100/80 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">Καταχώρηση Προμηθειών</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-xl">
                Το μηνιαίο report της Allwyn ανά κατάστημα. Οι προμήθειες είναι ο τζίρος
                — κάθε άλλο νούμερο στις αναφορές υπολογίζεται από εδώ.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <IconButton
              icon={ChevronLeft}
              label="Προηγούμενος μήνας"
              onClick={() => setMonth(shiftMonthKey(month, -1))}
              className="border border-slate-200 bg-white"
            />
            <span className="text-xs font-black text-slate-900 min-w-40 text-center">{monthLabel(month)}</span>
            <IconButton
              icon={ChevronRight}
              label="Επόμενος μήνας"
              onClick={() => setMonth(shiftMonthKey(month, 1))}
              className="border border-slate-200 bg-white"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-micro font-bold text-slate-500 uppercase tracking-wider">
            {toGreekUpper('Συνολικος τζιρος εταιρειας')} · {monthLabel(month)}
          </span>
          <span className="text-xl font-black font-mono tabular-nums text-slate-900">
            {formatCurrency(companyTotal)}
          </span>
        </div>
      </div>

      {(error || loadError) && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">{error || 'Η φόρτωση απέτυχε.'}</span>
          </div>
          {error && (
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Κλείσιμο"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {stores.map((store) => {
          const invalid = storeHasInvalid(store.id);
          return (
            <div key={store.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                <h3 className="text-xs font-black text-slate-900 truncate">{store.name}</h3>
                <span className="text-micro font-mono text-slate-500 shrink-0">{store.code}</span>
              </div>

              {/* MoneyInput carries its label only as aria-label, because it was
                  built for table cells where the column header names it. Here
                  three different companies get three identical boxes, so the
                  name has to be on screen. */}
              <div className="space-y-2.5">
                {COMMISSION_ENTITIES.map((entity) => (
                  <div key={entity} className="space-y-1">
                    <label
                      htmlFor={`comm-${store.id}-${entity}`}
                      className="block text-micro font-bold text-slate-600 uppercase tracking-wide"
                    >
                      {entity}
                    </label>
                    <MoneyInput
                      id={`comm-${store.id}-${entity}`}
                      label={entity}
                      value={draft[key(store.id, entity)] ?? ''}
                      onChange={(v) => setDraft((d) => ({ ...d, [key(store.id, entity)]: v }))}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-micro font-bold text-slate-500 uppercase tracking-wider block">
                    {toGreekUpper('Συνολο')}
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-slate-900">
                    {formatCurrency(storeTotal(store.id))}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {saved === store.id && (
                    <span className="inline-flex items-center gap-1 text-micro font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {toGreekUpper('Αποθηκευτηκε')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => save(store.id)}
                    disabled={savingStore === store.id || invalid}
                    title={invalid ? 'Υπάρχει πεδίο με μη έγκυρο ποσό' : undefined}
                    className="transition px-3 py-2 rounded-xl duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingStore === store.id ? 'Αποθήκευση…' : toGreekUpper('Αποθηκευση')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stores.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-10 text-center space-y-2">
          <Receipt className="w-9 h-9 mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-700">Δεν υπάρχουν καταστήματα</p>
          <p className="text-xs text-slate-500">Προσθέστε κατάστημα για να καταχωρήσετε προμήθειες.</p>
        </div>
      )}

      <p className="text-micro text-slate-500 leading-relaxed">
        Η καταχώρηση αντικαθιστά το ποσό του μήνα, δεν προστίθεται σε αυτό — αν ξαναμπεί ο
        ίδιος μήνας, η τιμή διορθώνεται. Κενό πεδίο αποθηκεύεται ως 0.
      </p>
    </div>
  );
};
