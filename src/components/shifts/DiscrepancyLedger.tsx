import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, RefreshCw, RotateCcw, Scale, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import {
  EmployeeCharge,
  EmployeeChargeResolution,
  MonthlyDiscrepancyRow,
  fetchEmployeeCharges,
  fetchMonthlyDiscrepancySummary,
  requestShiftCorrection,
  resolveEmployeeCharge,
} from '../../services/employeeChargeService.ts';
import { currentMonthKey, monthLabel, shiftMonthKey } from '../../lib/pnlEngine.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { Badge, BadgeTone } from '../ui/Badge.tsx';

const STATUS_META: Record<EmployeeCharge['status'], { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'ΑΝΟΙΧΤΗ', tone: 'danger' },
  SETTLED: { label: 'ΕΞΟΦΛΗΘΗΚΕ', tone: 'success' },
  WAIVED: { label: 'ΔΙΑΓΡΑΦΗΚΕ', tone: 'neutral' },
  CANCELLED: { label: 'ΑΚΥΡΩΘΗΚΕ', tone: 'neutral' },
};

// A charge belongs to the month its shift CLOSED in, which is the month the
// rollup counts it in. created_at is when the trigger happened to write the
// row and would put a late-submitted shift in the wrong month.
const chargeMonth = (c: EmployeeCharge): string =>
  (c.shift?.closed_at || c.shift?.opened_at || c.created_at).slice(0, 7);

export const DiscrepancyLedger: React.FC = () => {
  const { organization, hasPermission, roles } = useAuth();
  const { selectedStoreId } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';

  // Mirrors auth_is_elevated() in the database, which is what actually decides
  // whether resolve_employee_charge() and the correction both go through.
  const canResolve = useMemo(
    () =>
      hasPermission('*') ||
      (roles || []).some((r) =>
        ['ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER'].includes(r.code)
      ),
    [hasPermission, roles]
  );

  const [month, setMonth] = useState(() => currentMonthKey());
  const [summary, setSummary] = useState<MonthlyDiscrepancyRow[]>([]);
  const [charges, setCharges] = useState<EmployeeCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<
    { charge: EmployeeCharge; kind: EmployeeChargeResolution | 'CORRECTION' } | null
  >(null);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, all] = await Promise.all([
        fetchMonthlyDiscrepancySummary(month, selectedStoreId),
        fetchEmployeeCharges(orgId, selectedStoreId),
      ]);
      setSummary(rows);
      setCharges(all);
    } catch (e: any) {
      setError(e?.message || 'Αποτυχία φόρτωσης αποκλίσεων');
    } finally {
      setLoading(false);
    }
  }, [orgId, month, selectedStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  // The month's charges, plus any still-open charge from an earlier month -
  // those are the ones a manager has to act on, and hiding them behind a month
  // stepper is how a debt gets forgotten.
  const monthCharges = useMemo(
    () =>
      charges
        .filter((c) => chargeMonth(c) === month || (c.status === 'OPEN' && chargeMonth(c) < month))
        .sort((a, b) => chargeMonth(b).localeCompare(chargeMonth(a))),
    [charges, month]
  );

  const totals = useMemo(() => {
    const net = summary.reduce((a, r) => a + r.discrepancy_total, 0);
    const shortage = summary.reduce((a, r) => a + r.shortage_total, 0);
    const surplus = summary.reduce((a, r) => a + r.surplus_total, 0);
    const owedThisMonth = summary.reduce((a, r) => a + r.open_charges, 0);
    const shifts = summary.reduce((a, r) => a + r.shift_count, 0);
    return { net, shortage, surplus, owedThisMonth, shifts };
  }, [summary]);

  // Deliberately NOT month-scoped. A shortage nobody has paid is still owed in
  // November, and a card that reset to €0 every month would hide exactly the
  // balance this page exists to track. The month's own share is shown under it.
  const outstanding = useMemo(() => {
    const open = charges.filter((c) => c.status === 'OPEN');
    return {
      total: open.reduce((a, c) => a + Number(c.amount || 0), 0),
      count: open.length,
      older: open.filter((c) => chargeMonth(c) < month).length,
    };
  }, [charges, month]);

  const pickMonth = (next: string) => setMonth(next);

  const startAction = (charge: EmployeeCharge, kind: EmployeeChargeResolution | 'CORRECTION') => {
    setAction({ charge, kind });
    setNote('');
    setError(null);
  };

  const confirmAction = async () => {
    if (!action) return;
    setIsSaving(true);
    setError(null);
    try {
      if (action.kind === 'CORRECTION') {
        await requestShiftCorrection(action.charge.shift_id);
      } else {
        await resolveEmployeeCharge(action.charge.id, action.kind, note);
      }
      setAction(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Η ενέργεια απέτυχε');
    } finally {
      setIsSaving(false);
    }
  };

  const netTone =
    totals.net < -0.01 ? 'text-rose-600' : totals.net > 0.01 ? 'text-amber-600' : 'text-emerald-600';

  const actionTitle =
    action?.kind === 'SETTLED'
      ? 'Εξόφληση χρέωσης'
      : action?.kind === 'WAIVED'
      ? 'Διαγραφή χρέωσης'
      : action?.kind === 'OPEN'
      ? 'Επαναφορά σε ανοιχτή'
      : 'Αίτημα διόρθωσης';

  return (
    <div className="space-y-5">
      {/* Month + totals */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <IconButton
              icon={ChevronLeft}
              label="Προηγούμενος μήνας"
              onClick={() => pickMonth(shiftMonthKey(month, -1))}
              className="border border-slate-200 bg-white"
            />
            <span className="text-xs font-black text-slate-900 min-w-40 text-center">
              {monthLabel(month)}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Επόμενος μήνας"
              onClick={() => pickMonth(shiftMonthKey(month, 1))}
              className="border border-slate-200 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            {month !== currentMonthKey() && (
              <button
                type="button"
                onClick={() => pickMonth(currentMonthKey())}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {toGreekUpper('Τρεχων Μηνας')}
              </button>
            )}
            <IconButton
              icon={RefreshCw}
              label="Ανανέωση"
              onClick={load}
              className="border border-slate-200 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
            <span className="text-micro font-bold text-slate-500 uppercase tracking-wider block">
              {toGreekUpper('Συνολικη Αποκλιση')}
            </span>
            <span className={`text-lg sm:text-xl font-black font-mono tabular-nums block mt-1 ${netTone}`}>
              {formatCurrency(totals.net, { showSign: true })}
            </span>
            <span className="text-micro text-slate-500">{totals.shifts} βάρδιες</span>
          </div>
          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/70">
            <span className="text-micro font-bold text-rose-800 uppercase tracking-wider block">
              {toGreekUpper('Ελλειμματα')}
            </span>
            <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-rose-700 block mt-1">
              {formatCurrency(totals.shortage)}
            </span>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70">
            <span className="text-micro font-bold text-amber-800 uppercase tracking-wider block">
              {toGreekUpper('Πλεονασματα')}
            </span>
            <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-amber-800 block mt-1">
              {formatCurrency(totals.surplus)}
            </span>
          </div>
          <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
            <span className="text-micro font-bold text-indigo-700 uppercase tracking-wider block">
              {toGreekUpper('Ανεξοφλητα (Συνολικα)')}
            </span>
            <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-indigo-950 block mt-1">
              {formatCurrency(outstanding.total)}
            </span>
            <span className="text-micro text-slate-500">
              {outstanding.count === 0
                ? 'καμία εκκρεμότητα'
                : outstanding.older > 0
                ? `${outstanding.count} χρεώσεις · ${outstanding.older} από παλαιότερους μήνες`
                : `${outstanding.count} ${outstanding.count === 1 ? 'χρέωση' : 'χρεώσεις'} αυτόν τον μήνα`}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Κλείσιμο"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Per operator */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-900">{toGreekUpper('Ανα Υπαλληλο')}</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">Φόρτωση...</div>
        ) : summary.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Scale className="w-9 h-9 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Καμία κλεισμένη βάρδια</p>
            <p className="text-xs text-slate-500">Δεν υπάρχουν αποκλίσεις για {monthLabel(month)}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">{toGreekUpper('Υπαλληλος')}</th>
                  <th className="px-4 py-3 text-right">{toGreekUpper('Βαρδιες')}</th>
                  <th className="px-4 py-3 text-right">{toGreekUpper('Ελλειμμα')}</th>
                  <th className="px-4 py-3 text-right">{toGreekUpper('Πλεονασμα')}</th>
                  <th className="px-4 py-3 text-right">{toGreekUpper('Καθαρο')}</th>
                  <th className="px-4 py-3 text-right">{toGreekUpper('Ανεξοφλητα')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.map((r) => (
                  <tr key={r.employee_user_id || r.employee_name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{r.employee_name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">{r.shift_count}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                      {r.shortage_total > 0 ? formatCurrency(r.shortage_total) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-800">
                      {r.surplus_total > 0 ? formatCurrency(r.surplus_total) : '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-black ${
                        r.discrepancy_total < -0.01
                          ? 'text-rose-600'
                          : r.discrepancy_total > 0.01
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(r.discrepancy_total, { showSign: true })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-black text-indigo-950">
                      {r.open_charges > 0 ? formatCurrency(r.open_charges) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charges for the month */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="text-xs font-black text-slate-900">
            {toGreekUpper('Χρεωσεις')}
            {outstanding.older > 0 && (
              <span className="ml-2 font-bold text-micro text-amber-700 normal-case">
                + {outstanding.older} ανεξόφλητες από παλαιότερους μήνες
              </span>
            )}
          </h3>
          {!canResolve && (
            <span className="text-micro text-slate-500">Μόνο ο Ιδιοκτήτης ή ο Διευθυντής μπορεί να τις αλλάξει.</span>
          )}
        </div>
        {monthCharges.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Καμία χρέωση για {monthLabel(month)} και καμία ανεξόφλητη από παλαιότερα.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {monthCharges.map((c) => {
              const meta = STATUS_META[c.status];
              return (
                <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{c.employee_name}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>
                    <p className="text-micro text-slate-500 mt-0.5">
                      {c.shift?.store_name || '—'} ·{' '}
                      {new Date(c.shift?.closed_at || c.shift?.opened_at || c.created_at).toLocaleDateString('el-GR')}
                      {c.resolution_note ? ` · ${c.resolution_note}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-black text-sm text-rose-700">
                      {formatCurrency(c.amount)}
                    </span>
                    {canResolve && c.status === 'OPEN' && (
                      <>
                        <button
                          type="button"
                          onClick={() => startAction(c, 'SETTLED')}
                          className="transition px-2.5 py-1.5 rounded-lg duration-150 ease-out active:scale-[0.97] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                          title="Ο υπάλληλος πλήρωσε το έλλειμμα"
                        >
                          {toGreekUpper('Εξοφληση')}
                        </button>
                        <button
                          type="button"
                          onClick={() => startAction(c, 'WAIVED')}
                          className="transition px-2.5 py-1.5 rounded-lg duration-150 ease-out active:scale-[0.97] border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
                          title="Διαγραφή της χρέωσης χωρίς πληρωμή"
                        >
                          {toGreekUpper('Διαγραφη')}
                        </button>
                        <button
                          type="button"
                          onClick={() => startAction(c, 'CORRECTION')}
                          className="transition px-2.5 py-1.5 rounded-lg duration-150 ease-out active:scale-[0.97] border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs cursor-pointer"
                          title="Λάθος καταχώρηση - επιστροφή της βάρδιας για διόρθωση"
                        >
                          {toGreekUpper('Διορθωση')}
                        </button>
                      </>
                    )}
                    {canResolve && (c.status === 'SETTLED' || c.status === 'WAIVED') && (
                      <IconButton
                        icon={RotateCcw}
                        label="Επαναφορά σε ανοιχτή"
                        onClick={() => startAction(c, 'OPEN')}
                        className="border border-slate-200 bg-white"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {action && (
        <Modal
          isOpen
          onClose={() => setAction(null)}
          title={actionTitle}
          icon={action.kind === 'SETTLED' ? CheckCircle2 : action.kind === 'CORRECTION' ? RotateCcw : AlertTriangle}
          size="sm"
          footer={
            <ModalActions
              onCancel={() => setAction(null)}
              onSave={confirmAction}
              saveLabel={action.kind === 'CORRECTION' ? 'Αίτημα διόρθωσης' : 'Επιβεβαίωση'}
              isSaving={isSaving}
            />
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-700 leading-relaxed">
              {action.kind === 'CORRECTION' ? (
                <>
                  Η βάρδια του <strong>{action.charge.employee_name}</strong> επιστρέφει σε «Αίτημα Διόρθωσης»
                  ώστε να ξανακαταχωρηθεί. Η χρέωση {formatCurrency(action.charge.amount)} ακυρώνεται αυτόματα
                  μόλις η βάρδια υποβληθεί ισοσκελισμένη.
                </>
              ) : action.kind === 'SETTLED' ? (
                <>
                  Καταγράφεται ότι ο <strong>{action.charge.employee_name}</strong> πλήρωσε{' '}
                  {formatCurrency(action.charge.amount)}.
                </>
              ) : action.kind === 'WAIVED' ? (
                <>
                  Η χρέωση {formatCurrency(action.charge.amount)} διαγράφεται χωρίς πληρωμή.
                </>
              ) : (
                <>Η χρέωση επιστρέφει σε ανοιχτή κατάσταση.</>
              )}
            </p>

            {action.kind !== 'CORRECTION' && action.kind !== 'OPEN' && (
              <div>
                <label htmlFor="charge-note" className="block text-xs font-semibold text-slate-700 mb-1">
                  Σημείωση (προαιρετικά)
                </label>
                <input
                  id="charge-note"
                  type="text"
                  value={note}
                  maxLength={MAX_NOTES_LENGTH}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="π.χ. Πληρώθηκε σε μετρητά 14/10"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            )}

            <p className="text-micro text-slate-500">
              Κάθε αλλαγή καταγράφεται στο Audit Trail με τον χρήστη και την ώρα.
            </p>
          </div>

        </Modal>
      )}
    </div>
  );
};
