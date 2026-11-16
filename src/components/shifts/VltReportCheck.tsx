import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Badge } from '../ui/Badge.tsx';
import { MoneyField } from '../ui/MoneyField.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_CURRENCY_AMOUNT, parseNonNegativeAmount } from '../../lib/limits.ts';
import { currentMonthKey, daysOfMonth, monthLabel, shiftMonthKey, weekdayLabel } from '../../lib/pnlEngine.ts';
import { buildVltDayRows, vltMismatches, type VltDayRow } from '../../lib/vltReportCheck.ts';
import { deleteVltReport, fetchVltCheckData, saveVltReport } from '../../services/vltReportService.ts';

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
}> = ({ mismatches, storeName }) => {
  if (mismatches.length === 0) return null;
  return (
    <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-extrabold text-rose-900 text-sm">
          Διαφορά στα μετρητά VLT σε {mismatches.length} {mismatches.length === 1 ? 'ημέρα' : 'ημέρες'}
        </p>
        <p className="text-rose-800 mt-0.5">
          Το report του portal δεν ταιριάζει με ό,τι έγραψαν οι βάρδιες. Ελέγξτε το νούμερο του report και, αν είναι
          σωστό, τις βάρδιες εκείνης της ημέρας.
        </p>
        <ul className="mt-2 space-y-1">
          {mismatches.map((r) => (
            <li key={r.key} className="font-mono text-rose-900">
              <strong>{formatDay(r.date)}</strong> · {storeName(r.storeId)}: βάρδιες {formatCurrency(r.shiftsAmount)} ·
              report {formatCurrency(r.report ?? 0)} · διαφορά <strong>{signed(r.difference ?? 0)}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- πίνακας */

const StatusCell: React.FC<{ row: VltDayRow }> = ({ row }) => {
  switch (row.status) {
    case 'MATCH':
      return <Badge tone="success" icon={CheckCircle2}>ΤΑΙΡΙΑΖΕΙ</Badge>;
    case 'DIFFERENT':
      return (
        <Badge tone="danger" icon={AlertTriangle} mono>
          ΔΙΑΦΟΡΑ {signed(row.difference ?? 0)}
        </Badge>
      );
    case 'SHIFTS_OPEN':
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <Badge tone="warning">ΒΑΡΔΙΑ ΣΕ ΕΞΕΛΙΞΗ</Badge>
          <span className="text-micro text-slate-500">Δεν συγκρίνεται μέχρι να κλείσουν όλες</span>
        </span>
      );
    default:
      return <Badge tone="neutral">ΑΝΑΜΟΝΗ REPORT</Badge>;
  }
};

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
}> = ({ rows, storeName, showStore, drafts, savingKey, rowErrors = {}, readOnly, onDraftChange, onCommit }) => (
  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-micro">
            <th className="p-3">Ημέρα</th>
            {showStore && <th className="p-3">Κατάστημα</th>}
            <th className="p-3 text-right">Από τις βάρδιες</th>
            <th className="p-3 text-right">Report portal</th>
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
                className={row.status === 'DIFFERENT' ? 'bg-rose-50/60' : 'hover:bg-indigo-50/30 transition-colors'}
              >
                <td className="p-3">
                  <div className="font-bold text-slate-900">{formatDay(row.date)}</div>
                  <div className="text-micro text-slate-500">{weekdayLabel(row.date)}</div>
                </td>
                {showStore && <td className="p-3 text-slate-700">{storeName(row.storeId)}</td>}
                <td className="p-3 text-right font-mono font-bold text-slate-800">
                  {row.shiftCount === 0 ? (
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
                      aria-label={`Report portal ${formatDay(row.date)}`}
                      onChange={(next) => onDraftChange?.(row.key, next)}
                      onBlur={() => onCommit?.(row)}
                      className={`w-28 px-2.5 py-1.5 rounded-lg border text-right font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 ${
                        error ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    />
                  </div>
                  {error && <p className="text-micro font-bold text-rose-700 mt-1 text-right">{error}</p>}
                </td>
                <td className="p-3 text-right">
                  <StatusCell row={row} />
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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
      const built = buildVltDayRows({ shifts: data.shifts, reports: data.reports }).filter(
        (r) => r.date >= days[0] && r.date <= days[days.length - 1]
      );
      setRows(built);
      setReportsError(data.reportsError);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
            {toGreekUpper('Ελεγχος VLT: βαρδιες και report')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Δίπλα στα μετρητά στα VLTs που έγραψαν οι βάρδιες (το σύνολο της ημέρας, από την τελευταία βάρδια) γράψτε ένα
            νούμερο από το report του portal. Συγκρίνεται μόνο όταν έχουν κλείσει όλες οι βάρδιες της ημέρας.
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

      <VltAlertBanner mismatches={mismatches} storeName={storeName} />

      {reportsError && (
        <div role="status" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Δεν φορτώθηκαν τα reports.</strong> Φαίνονται μόνο τα νούμερα των βαρδιών ({reportsError}). Αν είναι η
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
        />
      )}
    </div>
  );
};
