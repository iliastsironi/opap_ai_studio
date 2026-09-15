import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, FileSpreadsheet, LayoutList, RefreshCw, Store, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { currentMonthKey, monthLabel, shiftMonthKey } from '../../lib/pnlEngine.ts';
import { exportMonthlyPnlWorkbook, monthlyPnlFileName } from '../../services/pnlExcelExport.ts';
import { CompanyExpensesSheet } from './CompanyExpensesSheet.tsx';
import { PayrollSheet } from './PayrollSheet.tsx';
import { PnlSummary } from './PnlSummary.tsx';
import { StorePnlSheet } from './StorePnlSheet.tsx';
import { secondaryAction } from './pnlDisplay.tsx';
import { useMonthlyPnl } from './useMonthlyPnl.ts';

type PnlView = 'SUMMARY' | 'STORES' | 'PAYROLL' | 'COMPANY';

const VIEWS: Array<{ id: PnlView; label: string; icon: LucideIcon }> = [
  { id: 'SUMMARY', label: 'Σύνοψη', icon: LayoutList },
  { id: 'STORES', label: 'Καταστήματα', icon: Store },
  { id: 'PAYROLL', label: 'Μισθοδοσία', icon: Users },
  { id: 'COMPANY', label: 'Έξοδα Εταιρίας', icon: Building2 },
];

const monthButton =
  'p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors';

// The Owner's monthly P&L, organised like the P&L_MMYY.xlsx workbook.
export const PnlWorkspace: React.FC = () => {
  const { organization, user } = useAuth();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [view, setView] = useState<PnlView>('SUMMARY');
  const [storeId, setStoreId] = useState<string | null>(null);
  const { data, loading, error, reload } = useMonthlyPnl(month, { withPrevious: true });

  if (!organization || !user) return null;

  const current = data?.month === month ? data : null;
  const thisMonth = currentMonthKey();
  const userName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Προηγούμενος μήνας" className={monthButton} onClick={() => setMonth(shiftMonthKey(month, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="min-w-40 text-center text-lg font-black text-slate-900" aria-live="polite">
            {monthLabel(month)}
          </h2>
          <button type="button" aria-label="Επόμενος μήνας" className={monthButton} onClick={() => setMonth(shiftMonthKey(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {month !== thisMonth && (
            <button type="button" className={secondaryAction} onClick={() => setMonth(thisMonth)}>
              Τρέχων μήνας
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryAction} onClick={() => reload()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Ανανέωση
          </button>
          <button
            type="button"
            disabled={!current}
            onClick={() => current && exportMonthlyPnlWorkbook(current.result)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel {monthlyPnlFileName(month)}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit max-w-full">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              view === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!current ? (
        !error && (
          <div className="py-16 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Φόρτωση P&L · {monthLabel(month)}…
          </div>
        )
      ) : (
        <>
          {view === 'SUMMARY' && current.previous && <PnlSummary result={current.result} previous={current.previous} />}
          {view === 'STORES' && (
            <StorePnlSheet
              result={current.result}
              orgId={organization.id}
              userId={user.id}
              userName={userName}
              storeId={storeId}
              onStoreChange={setStoreId}
              onChanged={reload}
            />
          )}
          {view === 'PAYROLL' && <PayrollSheet result={current.result} orgId={organization.id} onChanged={reload} />}
          {view === 'COMPANY' && (
            <CompanyExpensesSheet result={current.result} orgId={organization.id} userId={user.id} onChanged={reload} />
          )}
        </>
      )}
    </div>
  );
};
