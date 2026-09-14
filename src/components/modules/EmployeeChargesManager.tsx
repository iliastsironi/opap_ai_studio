import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, CheckCircle2, Gift, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Badge, BadgeTone } from '../ui/Badge.tsx';
import { ConfirmDialog, ConfirmTone } from '../ui/ConfirmDialog.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import {
  EmployeeCharge,
  EmployeeChargeResolution,
  EmployeeChargeStatus,
  fetchEmployeeCharges,
  resolveEmployeeCharge,
} from '../../services/employeeChargeService.ts';

const STATUS_META: Record<EmployeeChargeStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Ανοιχτή', tone: 'danger' },
  SETTLED: { label: 'Εξοφλήθηκε', tone: 'success' },
  WAIVED: { label: 'Χαρίστηκε', tone: 'info' },
  CANCELLED: { label: 'Ακυρώθηκε', tone: 'neutral' },
};

const ACTION_META: Record<EmployeeChargeResolution, { title: string; confirm: string; icon: LucideIcon; tone: ConfirmTone }> = {
  SETTLED: { title: 'Εξόφληση χρέωσης', confirm: 'Εξοφλήθηκε', icon: CheckCircle2, tone: 'positive' },
  WAIVED: { title: 'Χάρισμα χρέωσης', confirm: 'Χαρίστηκε', icon: Gift, tone: 'neutral' },
  OPEN: { title: 'Αναίρεση', confirm: 'Επαναφορά σε ανοιχτή', icon: RotateCcw, tone: 'neutral' },
};

const SHIFT_TYPE_LABELS: Record<string, string> = {
  MORNING: 'Πρωινή',
  AFTERNOON: 'Απογευματινή',
  NIGHT: 'Βραδινή',
  CUSTOM: 'Έκτακτη',
};

export const EmployeeChargesManager: React.FC = () => {
  const { organization, hasPermission } = useAuth();
  const { activeStoreId } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';
  const canResolve = hasPermission('employee_charges.manage');

  const [charges, setCharges] = useState<EmployeeCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [action, setAction] = useState<{ charge: EmployeeCharge; status: EmployeeChargeResolution } | null>(null);
  const [note, setNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setCharges(await fetchEmployeeCharges(orgId, activeStoreId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, activeStoreId]);

  const openBalances = useMemo(() => {
    const byEmployee = new Map<string, { key: string; name: string; total: number; count: number }>();
    for (const c of charges) {
      if (c.status !== 'OPEN') continue;
      const key = c.employee_user_id || c.employee_name;
      const entry = byEmployee.get(key) || { key, name: c.employee_name, total: 0, count: 0 };
      entry.total += Number(c.amount);
      entry.count += 1;
      byEmployee.set(key, entry);
    }
    return Array.from(byEmployee.values()).sort((a, b) => b.total - a.total);
  }, [charges]);

  const visibleCharges = showAll ? charges : charges.filter((c) => c.status === 'OPEN');

  const startAction = (charge: EmployeeCharge, status: EmployeeChargeResolution) => {
    setAction({ charge, status });
    setNote('');
    setError(null);
  };

  const confirmAction = async () => {
    if (!action) return;
    setIsResolving(true);
    setError(null);
    try {
      await resolveEmployeeCharge(action.charge.id, action.status, note);
      setAction(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Η ενέργεια δεν αποθηκεύτηκε.');
    } finally {
      setIsResolving(false);
    }
  };

  const filterButton = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
      active ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Χρεώσεις Υπαλλήλων</h1>
            <p className="text-xs text-slate-500">
              Ελλείμματα ταμείου που χρεώνονται αυτόματα στον χειριστή με την υποβολή της βάρδιας
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1" role="group" aria-label="Φίλτρο κατάστασης">
          <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)} className={filterButton(!showAll)}>
            Ανοιχτές
          </button>
          <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)} className={filterButton(showAll)}>
            Όλες
          </button>
        </div>
      </div>

      {openBalances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {openBalances.map((b) => (
            <div key={b.key} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <p className="text-sm font-bold text-slate-900 truncate">{b.name}</p>
              <p className="text-2xl font-black text-rose-600 font-mono tabular-nums mt-1">{formatCurrency(b.total)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {b.count} {b.count === 1 ? 'ανοιχτή χρέωση' : 'ανοιχτές χρεώσεις'}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibleCharges.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            {showAll ? 'Δεν υπάρχουν χρεώσεις.' : 'Δεν υπάρχουν ανοιχτές χρεώσεις.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ημερομηνία</th>
                  <th className="px-4 py-3">Κατάστημα</th>
                  <th className="px-4 py-3">Βάρδια</th>
                  <th className="px-4 py-3">Υπάλληλος</th>
                  <th className="px-4 py-3 text-right">Ποσό</th>
                  <th className="px-4 py-3">Κατάσταση</th>
                  {canResolve && <th className="px-4 py-3 text-right">Ενέργειες</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCharges.map((c) => {
                  const meta = STATUS_META[c.status];
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                        {new Date(c.shift?.closed_at || c.created_at).toLocaleDateString('el-GR')}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{c.shift?.store_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {(c.shift && SHIFT_TYPE_LABELS[c.shift.shift_type]) || '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{c.employee_name}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900 whitespace-nowrap tabular-nums">
                        {formatCurrency(Number(c.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {c.resolution_note && <p className="text-xs text-slate-500 mt-1 max-w-xs">{c.resolution_note}</p>}
                      </td>
                      {canResolve && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            {c.status === 'OPEN' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startAction(c, 'SETTLED')}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                                >
                                  Εξοφλήθηκε
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startAction(c, 'WAIVED')}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                                >
                                  Χαρίστηκε
                                </button>
                              </>
                            )}
                            {(c.status === 'SETTLED' || c.status === 'WAIVED') && (
                              <button
                                type="button"
                                onClick={() => startAction(c, 'OPEN')}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Αναίρεση</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {action && (
        <ConfirmDialog
          isOpen
          tone={ACTION_META[action.status].tone}
          icon={ACTION_META[action.status].icon}
          title={ACTION_META[action.status].title}
          message={
            <div className="space-y-3">
              <p>
                {action.charge.employee_name} · <strong>{formatCurrency(Number(action.charge.amount))}</strong>
              </p>
              {action.status !== 'OPEN' && (
                <textarea
                  value={note}
                  maxLength={MAX_NOTES_LENGTH}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  aria-label="Σημείωση"
                  placeholder="Σημείωση (προαιρετικό), π.χ. κρατήθηκε από τον μισθό Σεπτεμβρίου"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              )}
              {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
            </div>
          }
          confirmLabel={ACTION_META[action.status].confirm}
          isLoading={isResolving}
          loadingLabel="Αποθήκευση..."
          onConfirm={confirmAction}
          onCancel={() => setAction(null)}
        />
      )}
    </div>
  );
};
