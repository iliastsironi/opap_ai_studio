import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RefreshCw, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Badge } from '../ui/Badge.tsx';
import { MoneyField } from '../ui/MoneyField.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_CURRENCY_AMOUNT, parseNonNegativeAmount } from '../../lib/limits.ts';
import { currentMonthKey, daysOfMonth, monthLabel, shiftMonthKey, weekdayLabel } from '../../lib/pnlEngine.ts';
import { buildVltDayRows, summariseVltMonth, vltMismatches, type VltDayRow, type VltMonthSummary } from '../../lib/vltReportCheck.ts';
import {
  approveVltDifference,
  deleteVltManualCount,
  deleteVltReport,
  fetchVltCheckData,
  revokeVltApproval,
  saveVltManualCount,
  saveVltReport,
} from '../../services/vltReportService.ts';

/**
 * Έλεγχος VLT: τα μετρητά στα μηχανήματα όπως τα έγραψαν οι βάρδιες, δίπλα στο
 * report του portal.
 *
 * Ο πράκτορας: «δεν μπορούμε να ελέγξουμε τα λεφτά που μπαίνουν μέσα στα
 * μηχανάκια, παίρνουμε ένα report μετά από 1-2 μέρες· θα βάζουμε απλά ένα
 * νούμερο ανά ημέρα, να το διασταυρώνει μόνο του με τα μετρητά στα VLTs, και αν
 * βρίσκει διαφορά να ειδοποιεί». Δύο στήλες: ό,τι τράβηξε από τις βάρδιες, και
 * δίπλα το report για να το τσεκάρεις. Ο κανόνας της σύγκρισης ζει στο
 * lib/vltReportCheck.ts· εδώ είναι η οθόνη του.
 */

const formatDay = (date: string): string => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

/** Ποσό για πεδίο: με κόμμα, όπως το πληκτρολογεί κανείς στα ελληνικά. */
const toField = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','));

const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;

/* ---------------------------------------------------------------- ειδοποίηση */

export const VltAlertBanner: React.FC<{
  mismatches: ReadonlyArray<VltDayRow>;
  storeName: (storeId: string) => string;
  /** Έγκριση της διαφοράς μιας ημέρας από υπεύθυνο. Χωρίς αυτό δεν υπάρχουν κουμπιά. */
  onApprove?: (row: VltDayRow) => void;
  /** Το κλειδί της γραμμής που εγκρίνεται αυτή τη στιγμή. */
  approvingKey?: string | null;
  approveError?: string | null;
}> = ({ mismatches, storeName, onApprove, approvingKey, approveError }) => {
  if (mismatches.length === 0) return null;
  return (
    <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <div className="text-xs min-w-0 flex-1">
        <p className="font-extrabold text-rose-900 text-sm">
          Διαφορά στα μετρητά VLT σε {mismatches.length} {mismatches.length === 1 ? 'ημέρα' : 'ημέρες'}
        </p>
        <p className="text-rose-800 mt-0.5">
          Το Report Allwynnet δεν ταιριάζει με ό,τι έγραψαν οι βάρδιες. Ελέγξτε το νούμερο του Report Allwynnet
          και, αν είναι σωστό, τις βάρδιες εκείνης της ημέρας. Αν η διαφορά είναι γνωστή και αποδεκτή, εγκρίνετέ την.
          {mismatches.some((r) => r.manual) && ' Στο Play το νούμερο της ημέρας το γράφετε εσείς: ελέγξτε και αυτό.'}
        </p>
        <ul className="mt-2 space-y-1.5">
          {mismatches.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-rose-900">
              <span>
                <strong>{formatDay(r.date)}</strong> · {storeName(r.storeId)}: {r.manual ? 'χειροκίνητα' : 'βάρδιες'} {formatCurrency(r.shiftsAmount)} ·
                Report Allwynnet {formatCurrency(r.report ?? 0)} · διαφορά <strong>{signed(r.difference ?? 0)}</strong>
              </span>
              {onApprove && r.reportId && (
                <button
                  type="button"
                  onClick={() => onApprove(r)}
                  disabled={approvingKey === r.key}
                  aria-label={`Έγκριση διαφοράς ${formatDay(r.date)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-900 font-sans font-extrabold text-micro hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default"
                >
                  {approvingKey === r.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  Έγκριση διαφοράς
                </button>
              )}
            </li>
          ))}
        </ul>
        {approveError && <p className="mt-2 font-bold text-rose-900">{approveError}</p>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ σύνολο μήνα */

/**
 * Το σύνολο του μήνα και η απόκλιση, πάνω από τον πίνακα.
 *
 * Η απόκλιση είναι μόνο των ημερών που συγκρίθηκαν (είχαν report και είχαν κλείσει όλες οι βάρδιες):
 * μια ημέρα που περιμένει ακόμα το report δεν είναι «έλλειμμα» κατά ολόκληρο τον τζίρο της.
 */
export const VltMonthSummaryStrip: React.FC<{
  summary: VltMonthSummary;
  monthText: string;
  /** Όλες οι γραμμές γράφονται με το χέρι (μόνο Play), ή μόνο κάποιες (όλα τα καταστήματα μαζί). */
  manual?: 'ALL' | 'SOME';
}> = ({ summary, monthText, manual }) => {
  const dev = summary.deviation;
  const tone = dev === 0 ? 'text-emerald-700' : 'text-rose-700';
  const box = 'p-3.5 rounded-2xl border bg-white';
  return (
    <div data-testid="vlt-month-summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className={`${box} border-slate-200`}>
        <span className="text-micro font-extrabold text-slate-500 uppercase tracking-wider block">
          {manual === 'ALL' ? 'Σύνολο μήνα · χειροκίνητα' : 'Σύνολο μήνα · βάρδιες'}
        </span>
        <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">{formatCurrency(summary.shiftsTotal)}</span>
        <span className="text-micro text-slate-500">
          {manual === 'ALL'
            ? `VLT ${monthText}, όπως τα γράψατε`
            : manual === 'SOME'
              ? `VLT ${monthText}, από τις βάρδιες (Play: όπως τα γράψατε)`
              : `VLT ${monthText}, από τις βάρδιες`}
        </span>
      </div>
      <div className={`${box} border-slate-200`}>
        <span className="text-micro font-extrabold text-slate-500 uppercase tracking-wider block">
          Σύνολο μήνα · Report Allwynnet
        </span>
        <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">{formatCurrency(summary.reportTotal)}</span>
        <span className="text-micro text-slate-500">όσα reports έχουν γραφτεί</span>
      </div>
      <div className={`${box} ${dev === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/60'}`}>
        <span className="text-micro font-extrabold text-slate-600 uppercase tracking-wider block">Απόκλιση μήνα</span>
        <span className={`text-lg font-black font-mono block mt-0.5 ${tone}`} data-testid="vlt-month-deviation">
          {summary.comparedDays === 0 ? '—' : dev === 0 ? formatCurrency(0) : signed(dev)}
        </span>
        <span className="text-micro text-slate-500">
          {summary.comparedDays === 0
            ? 'καμία ημέρα δεν συγκρίθηκε ακόμα'
            : `report − βάρδιες, σε ${summary.comparedDays} ${summary.comparedDays === 1 ? 'ημέρα' : 'ημέρες'} που συγκρίθηκαν`}
        </span>
        {summary.approvedDays > 0 && (
          <span className="text-micro font-bold text-emerald-700 block mt-0.5">
            εκ των οποίων εγκεκριμένες: {signed(summary.approvedDeviation)} ({summary.approvedDays})
          </span>
        )}
      </div>
      <div className={`${box} border-slate-200`}>
        <span className="text-micro font-extrabold text-slate-500 uppercase tracking-wider block">Δεν συγκρίθηκαν ακόμα</span>
        <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">
          {summary.awaitingDays + summary.openDays + summary.awaitingCountDays}{' '}
          <span className="text-xs font-bold text-slate-500">
            {summary.awaitingDays + summary.openDays + summary.awaitingCountDays === 1 ? 'ημέρα' : 'ημέρες'}
          </span>
        </span>
        <span className="text-micro text-slate-500">
          {summary.awaitingDays > 0 ? `${summary.awaitingDays} περιμένουν report (${formatCurrency(summary.awaitingAmount)})` : 'κανένα report σε αναμονή'}
          {summary.openDays > 0 ? ` · ${summary.openDays} με βάρδια σε εξέλιξη` : ''}
          {summary.awaitingCountDays > 0 ? ` · ${summary.awaitingCountDays} περιμένουν νούμερο` : ''}
        </span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- πίνακας */

const approvalTitle = (row: VltDayRow): string => {
  const who = row.approval?.by ? ` από ${row.approval.by}` : ' από υπεύθυνο';
  const when = row.approval?.at ? ` στις ${new Date(row.approval.at).toLocaleString('el-GR')}` : '';
  return `Η διαφορά ${signed(row.approval?.amount ?? 0)} εγκρίθηκε${who}${when}`;
};

const StatusCell: React.FC<{
  row: VltDayRow;
  onApprove?: (row: VltDayRow) => void;
  onRevoke?: (row: VltDayRow) => void;
  busy?: boolean;
}> = ({ row, onApprove, onRevoke, busy }) => {
  switch (row.status) {
    case 'MATCH':
      return <Badge tone="success" icon={CheckCircle2}>ΤΑΙΡΙΑΖΕΙ</Badge>;
    case 'DIFFERENT':
      return (
        <span className="inline-flex flex-col items-end gap-1">
          {/* Η διαφορά μένει κόκκινη ακόμα κι όταν εγκριθεί: το ποσό δεν βγήκε. */}
          <Badge tone="danger" icon={AlertTriangle} mono>
            ΔΙΑΦΟΡΑ {signed(row.difference ?? 0)}
          </Badge>
          {row.approval ? (
            <span className="inline-flex items-center gap-1.5" data-vlt-approval="approved">
              <span title={approvalTitle(row)}>
                <Badge tone="success" icon={CheckCircle2}>
                  ΕΓΚΡΙΘΗΚΕ{row.approval.by ? ` · ${row.approval.by}` : ''}
                </Badge>
              </span>
              {onRevoke && (
                <button
                  type="button"
                  onClick={() => onRevoke(row)}
                  disabled={busy}
                  aria-label={`Αναίρεση έγκρισης ${formatDay(row.date)}`}
                  title="Αναίρεση της έγκρισης: η διαφορά ξαναβγάζει ειδοποίηση"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-60"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
              )}
            </span>
          ) : (
            onApprove &&
            row.reportId && (
              <button
                type="button"
                onClick={() => onApprove(row)}
                disabled={busy}
                aria-label={`Έγκριση διαφοράς ${formatDay(row.date)}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 bg-white text-micro font-extrabold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 className="w-3 h-3" />
                Έγκριση διαφοράς
              </button>
            )
          )}
        </span>
      );
    case 'SHIFTS_OPEN':
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <Badge tone="warning">ΒΑΡΔΙΑ ΣΕ ΕΞΕΛΙΞΗ</Badge>
          <span className="text-micro text-slate-500">Δεν συγκρίνεται μέχρι να κλείσουν όλες</span>
        </span>
      );
    case 'AWAITING_COUNT':
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <Badge tone="warning">ΑΝΑΜΟΝΗ ΝΟΥΜΕΡΟ</Badge>
          <span className="text-micro text-slate-500">Γράψτε τα μετρητά στα VLTs της ημέρας</span>
        </span>
      );
    default:
      return <Badge tone="neutral">ΑΝΑΜΟΝΗ REPORT</Badge>;
  }
};

/** Το κλειδί των πεδίων του χειροκίνητου νούμερου: ξεχωριστό από το κλειδί του report της ίδιας γραμμής. */
export const countKey = (rowKey: string): string => `count|${rowKey}`;

export const VltCheckTable: React.FC<{
  rows: ReadonlyArray<VltDayRow>;
  storeName: (storeId: string) => string;
  showStore: boolean;
  /** Ό,τι πληκτρολογείται αυτή τη στιγμή, ανά γραμμή. */
  drafts: Readonly<Record<string, string>>;
  savingKey?: string | null;
  rowErrors?: Readonly<Record<string, string>>;
  readOnly?: boolean;
  onDraftChange?: (key: string, value: string) => void;
  onCommit?: (row: VltDayRow) => void;
  /** Το νούμερο της ημέρας γράφτηκε με το χέρι (μόνο στις γραμμές του Play). */
  onCountCommit?: (row: VltDayRow) => void;
  onApprove?: (row: VltDayRow) => void;
  onRevoke?: (row: VltDayRow) => void;
  approvingKey?: string | null;
}> = ({
  rows,
  storeName,
  showStore,
  drafts,
  savingKey,
  rowErrors = {},
  readOnly,
  onDraftChange,
  onCommit,
  onCountCommit,
  onApprove,
  onRevoke,
  approvingKey,
}) => (
  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-micro">
            <th className="p-3">Ημέρα</th>
            {showStore && <th className="p-3">Κατάστημα</th>}
            <th className="p-3 text-right">
              {rows.length > 0 && rows.every((r) => r.manual) ? 'Μετρητά στα VLTs (χειροκίνητα)' : 'Από τις βάρδιες'}
            </th>
            <th className="p-3 text-right">Report Allwynnet</th>
            <th className="p-3 text-right">Έλεγχος</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-medium">
          {rows.map((row) => {
            const value = drafts[row.key] ?? toField(row.report);
            const error = rowErrors[row.key];
            return (
              <tr
                key={row.key}
                data-vlt-status={row.status}
                data-vlt-approved={row.approval ? 'true' : undefined}
                className={row.status === 'DIFFERENT' ? 'bg-rose-50/60' : 'hover:bg-indigo-50/30 transition-colors'}
              >
                <td className="p-3">
                  <div className="font-bold text-slate-900">{formatDay(row.date)}</div>
                  <div className="text-micro text-slate-500">{weekdayLabel(row.date)}</div>
                </td>
                {showStore && <td className="p-3 text-slate-700">{storeName(row.storeId)}</td>}
                <td className="p-3 text-right font-mono font-bold text-slate-800">
                  {row.manual ? (
                    <div className="inline-flex flex-col items-end">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {savingKey === countKey(row.key) && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
                        <MoneyField
                          value={drafts[countKey(row.key)] ?? toField(row.manualAmount)}
                          readOnly={readOnly}
                          nonNegative
                          placeholder="—"
                          aria-label={`Μετρητά στα VLTs ${formatDay(row.date)}`}
                          onChange={(next) => onDraftChange?.(countKey(row.key), next)}
                          onBlur={() => onCountCommit?.(row)}
                          className={`w-28 px-2.5 py-1.5 rounded-lg border text-right font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-brand ${
                            rowErrors[countKey(row.key)] ? 'border-rose-400' : 'border-slate-300'
                          }`}
                        />
                      </div>
                      <span className="text-micro font-sans font-bold text-slate-500 mt-0.5">γράφεται χειροκίνητα</span>
                      {rowErrors[countKey(row.key)] && (
                        <p className="text-micro font-sans font-bold text-rose-700 mt-1 text-right">{rowErrors[countKey(row.key)]}</p>
                      )}
                    </div>
                  ) : row.shiftCount === 0 ? (
                    <span className="text-slate-400" title="Καμία βάρδια αυτή την ημέρα">—</span>
                  ) : (
                    formatCurrency(row.shiftsAmount)
                  )}
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {savingKey === row.key && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
                    <MoneyField
                      value={value}
                      readOnly={readOnly}
                      nonNegative
                      placeholder="—"
                      aria-label={`Report Allwynnet ${formatDay(row.date)}`}
                      onChange={(next) => onDraftChange?.(row.key, next)}
                      onBlur={() => onCommit?.(row)}
                      className={`w-28 px-2.5 py-1.5 rounded-lg border text-right font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-brand ${
                        error ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    />
                  </div>
                  {error && <p className="text-micro font-bold text-rose-700 mt-1 text-right">{error}</p>}
                </td>
                <td className="p-3 text-right">
                  <StatusCell
                    row={row}
                    onApprove={readOnly ? undefined : onApprove}
                    onRevoke={readOnly ? undefined : onRevoke}
                    busy={approvingKey === row.key}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

/* ------------------------------------------------------------------ η καρτέλα */

export const VltReportCheck: React.FC<{ canEdit?: boolean }> = ({ canEdit = true }) => {
  const { organization, user } = useAuth();
  const { selectedStoreId, stores } = useTenant();
  const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard

  const [month, setMonth] = useState(() => currentMonthKey());
  const [rows, setRows] = useState<VltDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const storeName = useCallback(
    (storeId: string) => {
      const s = stores.find((x) => x.id === storeId);
      return s ? s.name || s.code || storeId : storeId;
    },
    [stores]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const days = daysOfMonth(month);
      const data = await fetchVltCheckData(
        orgId,
        selectedStoreId && selectedStoreId !== 'ALL' ? [selectedStoreId] : null,
        days[0],
        days[days.length - 1]
      );
      const built = buildVltDayRows({
        shifts: data.shifts,
        reports: data.reports,
        manualStoreIds: data.manualStoreIds,
        manualCounts: data.manualCounts,
      }).filter((r) => r.date >= days[0] && r.date <= days[days.length - 1]);
      setRows(built);
      setReportsError(data.reportsError);
      setManualError(data.manualError);
      setDrafts({});
      setRowErrors({});
    } catch (e: any) {
      setLoadError(e?.message || 'Αποτυχία φόρτωσης');
    } finally {
      setLoading(false);
    }
  }, [orgId, month, selectedStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  const mismatches = useMemo(() => vltMismatches(rows), [rows]);
  const monthSummary = useMemo(() => summariseVltMonth(rows), [rows]);

  /**
   * Έγκριση της διαφοράς μιας ημέρας από υπεύθυνο: η ειδοποίηση πάνω σταματά, η γραμμή μένει
   * κόκκινη με τικ. Γράφεται η ΣΥΓΚΕΚΡΙΜΕΝΗ διαφορά που φαίνεται τώρα στην οθόνη.
   */
  const approve = async (row: VltDayRow) => {
    if (!row.reportId || row.difference === null) return;
    setApprovingKey(row.key);
    setApproveError(null);
    try {
      await approveVltDifference({
        reportId: row.reportId,
        difference: row.difference,
        userId: user?.id,
        userName: user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : null,
      });
      await load();
    } catch (e: any) {
      setApproveError(e?.message || 'Η διαφορά δεν εγκρίθηκε.');
    } finally {
      setApprovingKey(null);
    }
  };

  const revoke = async (row: VltDayRow) => {
    if (!row.reportId) return;
    setApprovingKey(row.key);
    setApproveError(null);
    try {
      await revokeVltApproval(row.reportId);
      await load();
    } catch (e: any) {
      setApproveError(e?.message || 'Η έγκριση δεν αναιρέθηκε.');
    } finally {
      setApprovingKey(null);
    }
  };
  const showStore = !selectedStoreId || selectedStoreId === 'ALL';

  const commit = async (row: VltDayRow) => {
    const typed = drafts[row.key];
    if (typed === undefined) return; // δεν άγγιξε τίποτα
    const text = typed.trim();
    setRowErrors((prev) => {
      const { [row.key]: _gone, ...rest } = prev;
      return rest;
    });

    // Άδειο πεδίο: σβήνει το report, αν υπήρχε.
    if (text === '') {
      if (!row.reportId) {
        setDrafts(({ [row.key]: _d, ...rest }) => rest);
        return;
      }
      setSavingKey(row.key);
      try {
        await deleteVltReport(row.reportId);
        await load();
      } catch (e: any) {
        setRowErrors((prev) => ({ ...prev, [row.key]: e?.message || 'Δεν σβήστηκε.' }));
      } finally {
        setSavingKey(null);
      }
      return;
    }

    const parsed = parseNonNegativeAmount(text, MAX_CURRENCY_AMOUNT);
    if (!parsed.isValid) {
      setRowErrors((prev) => ({ ...prev, [row.key]: 'Γράψτε έναν αριθμό, π.χ. 1250,50.' }));
      return;
    }
    // Ίδιο με ό,τι υπάρχει ήδη: τίποτα να γραφτεί.
    if (row.report !== null && Math.round(parsed.value * 100) === Math.round(row.report * 100)) {
      setDrafts(({ [row.key]: _d, ...rest }) => rest);
      return;
    }

    setSavingKey(row.key);
    try {
      await saveVltReport({ orgId, storeId: row.storeId, date: row.date, amount: parsed.value, userId: user?.id });
      await load();
    } catch (e: any) {
      setRowErrors((prev) => ({ ...prev, [row.key]: e?.message || 'Δεν αποθηκεύτηκε.' }));
    } finally {
      setSavingKey(null);
    }
  };

  /** Το νούμερο της ημέρας που γράφεται με το χέρι (Play): ίδια συμπεριφορά με το report δίπλα του. */
  const commitCount = async (row: VltDayRow) => {
    const field = countKey(row.key);
    const typed = drafts[field];
    if (typed === undefined) return;
    const text = typed.trim();
    setRowErrors((prev) => {
      const { [field]: _gone, ...rest } = prev;
      return rest;
    });

    if (text === '') {
      if (!row.manualId) {
        setDrafts(({ [field]: _d, ...rest }) => rest);
        return;
      }
      setSavingKey(field);
      try {
        await deleteVltManualCount(row.manualId);
        await load();
      } catch (e: any) {
        setRowErrors((prev) => ({ ...prev, [field]: e?.message || 'Δεν σβήστηκε.' }));
      } finally {
        setSavingKey(null);
      }
      return;
    }

    const parsed = parseNonNegativeAmount(text, MAX_CURRENCY_AMOUNT);
    if (!parsed.isValid) {
      setRowErrors((prev) => ({ ...prev, [field]: 'Γράψτε έναν αριθμό, π.χ. 1250,50.' }));
      return;
    }
    if (row.manualAmount !== null && Math.round(parsed.value * 100) === Math.round(row.manualAmount * 100)) {
      setDrafts(({ [field]: _d, ...rest }) => rest);
      return;
    }

    setSavingKey(field);
    try {
      await saveVltManualCount({ orgId, storeId: row.storeId, date: row.date, amount: parsed.value, userId: user?.id });
      await load();
    } catch (e: any) {
      setRowErrors((prev) => ({ ...prev, [field]: e?.message || 'Δεν αποθηκεύτηκε.' }));
    } finally {
      setSavingKey(null);
    }
  };

  const manualRows = rows.filter((r) => r.manual).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
            {toGreekUpper('Ελεγχος VLTs: βαρδιες και Report Allwynnet')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Δίπλα στα μετρητά στα VLTs που έγραψαν οι βάρδιες (το σύνολο της ημέρας, από την τελευταία βάρδια) γράψτε ένα
            νούμερο από το Report Allwynnet. Συγκρίνεται μόνο όταν έχουν κλείσει όλες οι βάρδιες της ημέρας.
            {manualRows > 0 &&
              ' Στο Play τα μετρητά στα VLTs δεν τραβιούνται από τις βάρδιες: τα γράφετε εσείς, ανά ημέρα, και συγκρίνονται με το Report Allwynnet.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            icon={ChevronLeft}
            label="Προηγούμενος μήνας"
            onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
            className="border border-slate-200 bg-white"
          />
          <span className="text-xs font-extrabold text-slate-800 capitalize min-w-32 text-center">{monthLabel(month)}</span>
          <IconButton
            icon={ChevronRight}
            label="Επόμενος μήνας"
            onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
            disabled={month >= currentMonthKey()}
            className="border border-slate-200 bg-white"
          />
          <button
            type="button"
            onClick={load}
            aria-label="Ανανέωση"
            className="p-2 rounded-xl border border-slate-200/90 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      <VltAlertBanner
        mismatches={mismatches}
        storeName={storeName}
        onApprove={canEdit ? approve : undefined}
        approvingKey={approvingKey}
        approveError={approveError}
      />

      {rows.length > 0 && (
        <VltMonthSummaryStrip
          summary={monthSummary}
          monthText={monthLabel(month)}
          manual={manualRows === 0 ? undefined : manualRows === rows.length ? 'ALL' : 'SOME'}
        />
      )}

      {manualError && (
        <div role="status" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Δεν φορτώθηκαν τα νούμερα που γράφονται χειροκίνητα στο Play.</strong> Οι ημέρες του Play εμφανίζονται ως
          «ΑΝΑΜΟΝΗ ΝΟΥΜΕΡΟ» και δεν συγκρίνονται ({manualError}). Αν είναι η πρώτη φορά, ο πίνακας δεν έχει δημιουργηθεί ακόμα.
        </div>
      )}

      {reportsError && (
        <div role="status" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Δεν φορτώθηκαν τα Report Allwynnet.</strong> Φαίνονται μόνο τα νούμερα των βαρδιών ({reportsError}). Αν είναι η
          πρώτη φορά που ανοίγετε αυτή την καρτέλα, ο πίνακας των reports δεν έχει δημιουργηθεί ακόμα.
        </div>
      )}

      {loadError ? (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-800">
          {loadError}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs font-bold">Φόρτωση…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 border border-dashed border-slate-300 rounded-2xl text-xs">
          Δεν υπάρχουν βάρδιες με VLT αυτόν τον μήνα{showStore ? '' : ' σε αυτό το κατάστημα'}.
        </div>
      ) : (
        <VltCheckTable
          rows={rows}
          storeName={storeName}
          showStore={showStore}
          drafts={drafts}
          savingKey={savingKey}
          rowErrors={rowErrors}
          readOnly={!canEdit}
          onDraftChange={(key, value) => setDrafts((prev) => ({ ...prev, [key]: value }))}
          onCommit={commit}
          onCountCommit={commitCount}
          onApprove={approve}
          onRevoke={revoke}
          approvingKey={approvingKey}
        />
      )}
    </div>
  );
};
