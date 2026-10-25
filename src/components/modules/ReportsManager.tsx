import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Award,
  BarChart3,
  ClipboardList,
  Clock,
  DollarSign,
  Layers,
  PieChart as PieIcon,
  Coins,
  ChevronLeft,
  ChevronRight,
  Building2,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchShiftsFromFirestore } from '../../services/shiftService.ts';
import { fetchVltReconciliations, saveVltReconciliation } from '../../services/financialRecordsService.ts';
import { computeDynamicFinancials } from '../../services/kpiEngine.ts';
import { VltReconciliationRecord } from '../../data/pnlData.ts';
import { DailyAggregationView } from '../shifts/DailyAggregationView.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { athensDateKey, currentMonthKey, monthLabel, shiftMonthKey, totalCosts } from '../../lib/pnlEngine.ts';
import { buildShiftDailySeries } from '../../lib/shiftDailySeries.ts';
import { pickNum, safeNum } from '../../services/financialCalculator.ts';
import { IconButton } from '../ui/IconButton.tsx';
import { PnlWorkspace } from '../pnl/PnlWorkspace.tsx';
import { CommissionEntrySheet } from '../pnl/CommissionEntrySheet.tsx';
import { percentLabel } from '../pnl/pnlDisplay.tsx';
import { useMonthlyPnl } from '../pnl/useMonthlyPnl.ts';
import { NumericField } from '../ui/NumericField.tsx';

type ReportsTab = 'OVERVIEW' | 'COMMISSIONS' | 'PNL' | 'DAILY_REPORT' | 'EMPLOYEE_KPIS' | 'SHIFT_KPIS';

// Literal strings, never interpolated: these reach the DOM as inline styles,
// but keeping them as plain constants matches how Badge.tsx handles the same
// problem for Tailwind's scanner and stays greppable.
const SUPPLIER_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// Percentages to one decimal with a Greek comma, forced to sum to 100,0.
// Rounding each slice independently lands on 99,9 or 100,1 often enough that a
// reader notices, and a breakdown that does not add up reads as a bug. The
// remainder goes to the largest slice, where it is proportionally least
// visible. Shared by both pies so they round the same way.
function withShares<T extends { name: string; value: number }>(rows: T[], total: number) {
  if (total <= 0) return rows.map((r) => ({ ...r, share: 0, shareLabel: '—' }));
  const rounded = rows.map((r) => ({ ...r, share: Math.round((r.value / total) * 1000) / 10 }));
  const drift = Math.round((100 - rounded.reduce((a, r) => a + r.share, 0)) * 10) / 10;
  if (drift !== 0 && rounded.length > 0) {
    let biggest = 0;
    rounded.forEach((r, i) => {
      if (r.value > rounded[biggest].value) biggest = i;
    });
    rounded[biggest] = { ...rounded[biggest], share: Math.round((rounded[biggest].share + drift) * 10) / 10 };
  }
  return rounded.map((r) => ({ ...r, shareLabel: `${r.share.toFixed(1).replace('.', ',')}%` }));
}

// Owner-only, like the RLS on the P&L tables.
const PNL_PERMISSION = 'pnl.manage';

const REPORTS_TABS: Array<{ id: ReportsTab; label: string; icon: LucideIcon; permission?: string }> = [
  { id: 'OVERVIEW', label: 'Επισκόπηση & KPIs', icon: BarChart3 },
  { id: 'COMMISSIONS', label: 'Καταχώρηση Προμηθειών', icon: Coins, permission: PNL_PERMISSION },
  { id: 'PNL', label: 'Οικονομικό P&L', icon: Receipt, permission: PNL_PERMISSION },
  { id: 'DAILY_REPORT', label: 'Ημερήσιο Συγκεντρωτικό Βαρδιών', icon: Layers },
  { id: 'EMPLOYEE_KPIS', label: 'KPIs Εργαζομένων', icon: Users },
  { id: 'SHIFT_KPIS', label: 'KPIs Βαρδιών & VLTs Opapnet', icon: Clock },
];

interface OverviewCardProps {
  label: string;
  value: string;
  valueClass?: string;
  icon: LucideIcon;
  iconClass: string;
  footer: React.ReactNode;
}

const OverviewCard: React.FC<OverviewCardProps> = ({ label, value, valueClass = 'text-slate-900', icon: Icon, iconClass, footer }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
    <div className="flex justify-between items-start gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500 tracking-wider">{toGreekUpper(label)}</p>
        <h3 className={`text-2xl font-black mt-1.5 tracking-tight tabular-nums ${valueClass}`}>{value}</h3>
      </div>
      <div className={`p-2.5 rounded-xl border shrink-0 ${iconClass}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium">
      {footer}
    </div>
  </div>
);

interface VltFormState {
  storeId: string;
  date: string;
  opapnetAmount: number;
  countedAmount: number;
}

interface ReportsManagerProps {
  onNavigate?: (tab: string) => void;
}

export const ReportsManager: React.FC<ReportsManagerProps> = ({ onNavigate }) => {
  const { selectedStoreId, stores } = useTenant();
  const { organization, hasPermission } = useAuth();
  const canManagePnl = hasPermission(PNL_PERMISSION);

  const [activeTab, setActiveTab] = useState<ReportsTab>('OVERVIEW');
  const [loading, setLoading] = useState(false);

  const [rawShifts, setRawShifts] = useState<any[]>([]);
  const [rawVltRecs, setRawVltRecs] = useState<VltReconciliationRecord[]>([]);

  // Filtering
  const [selectedFilterStore, setSelectedFilterStore] = useState('ALL');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [showVltModal, setShowVltModal] = useState(false);
  const [newVltRec, setNewVltRec] = useState<VltFormState>({ storeId: '', date: '', opapnetAmount: 0, countedAmount: 0 });

  const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard

  // This month's money cards come from the P&L, so they share its Owner-only access.
  // Was frozen with useMemo(..., []) - the overview could only ever show the
  // current month. UAT asked for a period the Owner picks.
  const [overviewMonth, setOverviewMonth] = useState(() => currentMonthKey());
  // 'ALL' is the company: every store plus corporate costs and loans. A single
  // store shows its own trading only - company costs belong to no one store.
  const [overviewScope, setOverviewScope] = useState<string>('ALL');
  // Empty means «no range asked for»: the chart then shows the most recent
  // recorded days rather than nothing, which is the useful default on a blank
  // overview.
  const [chartFrom, setChartFrom] = useState<string>('');
  const [chartTo, setChartTo] = useState<string>('');
  const { data: overviewData, error: overviewError } = useMonthlyPnl(overviewMonth, { enabled: canManagePnl });
  const overviewPnl = overviewData?.result ?? null;
  const pendingValue = overviewError ? '—' : '…';

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [shifts, vlt] = await Promise.all([
        fetchShiftsFromFirestore(orgId, selectedStoreId === 'ALL' ? undefined : selectedStoreId),
        fetchVltReconciliations(orgId),
      ]);
      setRawShifts(shifts || []);
      setRawVltRecs(vlt || []);
    } catch (err) {
      console.error('Error loading report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [orgId, selectedStoreId]);

  const { employeeKpis, shiftKpis, vltReconciliations, totals } = useMemo(
    () => computeDynamicFinancials({ shifts: rawShifts, vltReconciliations: rawVltRecs }),
    [rawShifts, rawVltRecs]
  );

  // Everything below is derived from the single monthly result the engine
  // already returns - result.stores[] is per store - so the scope selector
  // costs no extra query.
  // ALL of a store's units, not just its STORE one: 101499 also has an F&B unit
  // carrying +3.511,59 in August, and dropping it would understate the store.
  const scopedUnits =
    overviewScope === 'ALL' ? [] : (overviewPnl?.units ?? []).filter((u) => u.storeId === overviewScope);
  const sumUnits = (pick: (u: (typeof scopedUnits)[number]) => number) =>
    scopedUnits.reduce((a, u) => a + pick(u), 0);

  const scopedRevenue =
    overviewScope === 'ALL' ? overviewPnl?.storesTotal.revenue ?? 0 : sumUnits((u) => u.revenue);
  // A single store carries no company costs or loans - those belong to no one
  // store - so its costs are only what it spent itself.
  const scopedCosts =
    overviewScope === 'ALL'
      ? overviewPnl
        ? totalCosts(overviewPnl)
        : 0
      : sumUnits((u) => u.dailyExpenses + u.fixedCosts + u.payroll);
  const scopedResult =
    overviewScope === 'ALL' ? overviewPnl?.netResult ?? 0 : sumUnits((u) => u.result);

  // «—», never 0%. A month with no commissions entered has no margin, which is
  // a different thing from a margin of zero, and showing 0% would make a
  // missing Allwyn report look like a terrible month.
  const profitabilityLabel = scopedRevenue > 0 ? percentLabel(scopedResult / scopedRevenue) : '—';

  const costMixData = overviewPnl
    ? [
        { name: 'Έξοδα Ημέρας & F&B', value: overviewPnl.storesTotal.dailyExpenses, color: '#ef4444' },
        { name: 'Πάγια Καταστημάτων', value: overviewPnl.storesTotal.fixedCosts, color: '#f59e0b' },
        { name: 'Μισθοδοσία', value: overviewPnl.storesTotal.payroll, color: '#8b5cf6' },
        { name: 'Έξοδα Εταιρίας', value: overviewPnl.companyExpenses, color: '#3b82f6' },
        { name: 'Δάνεια', value: overviewPnl.loans, color: '#64748b' },
      ]
    : [];
  // Where the money actually went, by supplier.
  //
  // The cost mix above answers "what kind of cost" in five P&L buckets. This
  // answers "to whom", which is the question «ανά κατηγορία» really needs here:
  // shift_expenses carries only two category values in practice - EXPENSES_GP
  // and EXPENSES_FNB - so a pie by category is two slices and says nothing,
  // while August alone has 17 distinct suppliers.
  //
  // Built from the day grids the engine already produces, so it respects the
  // same month and scope as everything else and costs no extra query.
  const supplierData = (() => {
    const sheets = (overviewPnl?.stores ?? []).filter(
      (sheet) => overviewScope === 'ALL' || sheet.store.id === overviewScope
    );
    // Keyed case-insensitively, because the same supplier gets typed both ways:
    // August has «OSTRIA» and «Ostria» as separate columns for one business.
    // Only case is folded - «Hausbranft» and «HAUSBRANDT» differ by a letter, so
    // they stay apart rather than this guessing at spelling mistakes.
    const totals = new Map<string, { label: string; value: number }>();
    for (const sheet of sheets) {
      for (const grid of [sheet.dailyExpenses, sheet.fnb?.expenses]) {
        if (!grid) continue;
        for (const [supplier, amount] of Object.entries(grid.columnTotals)) {
          if (!amount) continue;
          const label = supplier.trim() || '(χωρίς όνομα)';
          const k = label.toLocaleUpperCase('el-GR');
          const entry = totals.get(k) ?? { label, value: 0 };
          entry.value += amount;
          totals.set(k, entry);
        }
      }
    }
    const sorted = [...totals.values()]
      .map((e) => [e.label, e.value] as [string, number])
      .sort((a, b) => b[1] - a[1]);
    // A pie with 17 slices is unreadable, so beyond the top 8 everything is
    // gathered into «Λοιποί». It is still in the total, just not its own wedge.
    const TOP = 8;
    const head = sorted.slice(0, TOP);
    const tailTotal = sorted.slice(TOP).reduce((a, [, v]) => a + v, 0);
    const rows = head.map(([name, value], i) => ({ name, value, color: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length] }));
    if (tailTotal > 0) {
      rows.push({ name: `Λοιποί (${sorted.length - TOP})`, value: tailTotal, color: '#94a3b8' });
    }
    return rows;
  })();

  const supplierTotal = supplierData.reduce((a, c) => a + c.value, 0);
  const supplierShares = withShares(supplierData, supplierTotal);

  const costMixTotal = costMixData.reduce((a, c) => a + c.value, 0);
  // Percentages to one decimal, Greek comma, and forced to add up: rounding five
  // slices independently can land on 99,9% or 100,1%, and a breakdown that does
  // not sum to 100 reads as a bug. The remainder goes to the largest slice,
  // where it is proportionally least visible.
  const costMixShares = withShares(costMixData, costMixTotal);

  const hasCosts = costMixData.some((item) => item.value > 0);
  const discrepantShifts = rawShifts.filter((s) => Math.abs(Number(s.discrepancy || 0)) >= 1).length;

  // One bar per trading day; see buildShiftDailySeries for what this replaced
  // and why. No shifts means an empty chart - a plotted line the user could
  // mistake for their own trading would be worse than none.
  const shiftChartData = useMemo(
    () => buildShiftDailySeries(rawShifts, { from: chartFrom || undefined, to: chartTo || undefined }),
    [rawShifts, chartFrom, chartTo]
  );

  // Filtered employees
  const filteredEmployees = employeeKpis.filter((e) => {
    const matchesSearch = e.employeeName.toLowerCase().includes(employeeSearch.toLowerCase());
    const matchesStore = selectedFilterStore === 'ALL' || e.storeId === selectedFilterStore;
    return matchesSearch && matchesStore;
  });

  const storeName = (id?: string | null) => (id ? (stores.find((s) => s.id === id)?.name ?? id) : '—');

  const openVltModal = () => {
    setNewVltRec({
      storeId: selectedStoreId !== 'ALL' ? selectedStoreId : (stores[0]?.id ?? ''),
      date: athensDateKey(new Date().toISOString()),
      opapnetAmount: 0,
      countedAmount: 0,
    });
    setShowVltModal(true);
  };

  const handleSaveVltRec = async (e: React.FormEvent) => {
    e.preventDefault();
    const opap = Number(newVltRec.opapnetAmount || 0);
    const counted = Number(newVltRec.countedAmount || 0);
    const diff = Math.round((counted - opap) * 100) / 100;
    const rec: VltReconciliationRecord = {
      storeId: newVltRec.storeId || null,
      date: newVltRec.date,
      opapnetAmount: opap,
      countedAmount: counted,
      difference: diff,
      status: diff === 0 ? 'BALANCED' : 'DISCREPANCY',
    };
    setIsSavingRecord(true);
    try {
      await saveVltReconciliation(orgId, rec);
      setShowVltModal(false);
      await loadReportData();
    } finally {
      setIsSavingRecord(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">
              {canManagePnl ? 'Στατιστικά, KPIs & Οικονομικό P&L' : 'Στατιστικά & KPIs'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {canManagePnl
                ? 'Μηνιαίο P&L από προμήθειες, έξοδα, πάγια και μισθοδοσία · KPIs εργαζομένων, βαρδιών και VLTs από τις βάρδιες.'
                : 'KPIs εργαζομένων, βαρδιών και VLTs από τις καταχωρημένες βάρδιες.'}
            </p>
          </div>
        </div>

        {activeTab !== 'PNL' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadReportData}
              disabled={loading}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Ανανέωση δεδομένων από τις πρόσφατες καταχωρήσεις"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Ανανέωση</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap gap-1">
        {REPORTS_TABS.filter((tab) => !tab.permission || hasPermission(tab.permission)).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-pressed={activeTab === id}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW & CORE KPIS */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Period and scope. Owner-only, because only the Owner sees the money
              cards these drive; for anyone else the controls would do nothing. */}
          {canManagePnl && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <IconButton
                  icon={ChevronLeft}
                  label="Προηγούμενος μήνας"
                  onClick={() => setOverviewMonth(shiftMonthKey(overviewMonth, -1))}
                  className="border border-slate-200 bg-white"
                />
                <span className="text-xs font-black text-slate-900 min-w-40 text-center">
                  {monthLabel(overviewMonth)}
                </span>
                <IconButton
                  icon={ChevronRight}
                  label="Επόμενος μήνας"
                  onClick={() => setOverviewMonth(shiftMonthKey(overviewMonth, 1))}
                  className="border border-slate-200 bg-white"
                />
                {overviewMonth !== currentMonthKey() && (
                  <button
                    type="button"
                    onClick={() => setOverviewMonth(currentMonthKey())}
                    className="ml-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {toGreekUpper('Τρεχων Μηνας')}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="overview-scope" className="sr-only">Εύρος αναφοράς</label>
                <select
                  id="overview-scope"
                  value={overviewScope}
                  onChange={(e) => setOverviewScope(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Σύνολο Εταιρείας</option>
                  {stores.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setActiveTab('PNL')}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  title="Καταχώρηση και προβολή εταιρικών εξόδων και δανείων"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  {toGreekUpper('Εξοδα Εταιριας')}
                </button>
              </div>
            </div>
          )}

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${canManagePnl ? 'lg:grid-cols-4' : ''}`}>
            {canManagePnl ? (
              <>
                <OverviewCard
                  label={`Τζίρος · ${monthLabel(overviewMonth)}`}
                  value={overviewPnl ? formatCurrency(scopedRevenue) : pendingValue}
                  icon={DollarSign}
                  iconClass="bg-indigo-50 text-indigo-600 border-indigo-100/80"
                  footer={
                    <>
                      <span>Προμήθειες και F&B</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('PNL')}
                        className="font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        Άνοιγμα P&L
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </>
                  }
                />
                <OverviewCard
                  label={`Έξοδα · ${monthLabel(overviewMonth)}`}
                  value={overviewPnl ? formatCurrency(scopedCosts) : pendingValue}
                  valueClass="text-rose-600"
                  icon={Receipt}
                  iconClass="bg-rose-50 text-rose-600 border-rose-100/80"
                  footer={
                    <span>
                      {overviewScope === 'ALL'
                        ? 'Ημέρας, πάγια, μισθοδοσία, εταιρίας και δάνεια'
                        : 'Ημέρας, πάγια και μισθοδοσία — χωρίς εταιρικά'}
                    </span>
                  }
                />
                <OverviewCard
                  label="Καθαρό αποτέλεσμα προ φόρων"
                  value={overviewPnl ? formatCurrency(scopedResult) : pendingValue}
                  valueClass={overviewPnl && scopedResult < 0 ? 'text-rose-600' : 'text-emerald-600'}
                  icon={Wallet}
                  iconClass={
                    overviewPnl && scopedResult < 0
                      ? 'bg-rose-50 text-rose-600 border-rose-100/80'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-100/80'
                  }
                  footer={
                    <span>
                      {overviewScope === 'ALL' ? 'Τζίρος − έξοδα, μετά τα εταιρικά' : 'Τζίρος − έξοδα καταστήματος'}
                    </span>
                  }
                />
              </>
            ) : (
              <OverviewCard
                label="Καταχωρημένες βάρδιες"
                value={String(rawShifts.length)}
                icon={ClipboardList}
                iconClass="bg-indigo-50 text-indigo-600 border-indigo-100/80"
                footer={
                  <>
                    <span>Με απόκλιση ταμείου</span>
                    <span className="font-bold text-slate-700">{discrepantShifts}</span>
                  </>
                }
              />
            )}

            <OverviewCard
              label="Δείκτης Κερδοφορίας"
              value={profitabilityLabel}
              valueClass={
                scopedRevenue > 0 && scopedResult < 0
                  ? 'text-rose-600'
                  : scopedRevenue > 0
                  ? 'text-emerald-600'
                  : 'text-slate-400'
              }
              icon={TrendingUp}
              iconClass={
                scopedRevenue > 0 && scopedResult < 0
                  ? 'bg-rose-50 text-rose-600 border-rose-100/80'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100/80'
              }
              footer={
                <>
                  <span>Καθαρό επί του τζίρου</span>
                  <span className="font-bold text-slate-700">
                    {scopedRevenue > 0 ? formatCurrency(scopedResult) : 'Χωρίς τζίρο'}
                  </span>
                </>
              }
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Daily Revenue & Expenses Trend */}
            <div className={`${canManagePnl ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span>Τζίρος & Καταμετρημένο Ταμείο ανά Ημέρα</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Μόνο ημέρες με κλεισμένες βάρδιες — οι ημέρες χωρίς βάρδια δεν εμφανίζονται
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="chart-from" className="text-micro font-bold text-slate-500 uppercase tracking-wider">Από</label>
                  <input
                    id="chart-from"
                    type="date"
                    value={chartFrom}
                    max={chartTo || undefined}
                    onChange={(e) => setChartFrom(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                  />
                  <label htmlFor="chart-to" className="text-micro font-bold text-slate-500 uppercase tracking-wider">Έως</label>
                  <input
                    id="chart-to"
                    type="date"
                    value={chartTo}
                    min={chartFrom || undefined}
                    onChange={(e) => setChartTo(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                  />
                  {(chartFrom || chartTo) && (
                    <button
                      type="button"
                      onClick={() => { setChartFrom(''); setChartTo(''); }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Καθαρισμός
                    </button>
                  )}
                </div>
              </div>

              <div className="h-72 w-full pt-2">
                {shiftChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center">
                    <p className="text-xs text-slate-500 max-w-xs">
                      {chartFrom || chartTo
                        ? 'Δεν υπάρχουν κλεισμένες βάρδιες σε αυτό το διάστημα. Δοκιμάστε άλλες ημερομηνίες ή καθαρίστε το φίλτρο.'
                        : 'Δεν υπάρχουν κλεισμένες βάρδιες, οπότε δεν υπάρχει γράφημα.'}
                    </p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shiftChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [formatCurrency(Number(value) || 0), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="revenue" name="Συνολικά Έσοδα (€)" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    <Bar dataKey="countedCash" name="Καταμετρημένο Ταμείο (€)" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Cost Breakdown (this month's P&L) */}
            {canManagePnl && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-purple-600" />
                    <span>Κατανομή Εξόδων (Cost Mix)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{monthLabel(overviewMonth)} · από το Οικονομικό P&L</p>
                </div>

                {hasCosts ? (
                  <>
                    <div className="h-60 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={costMixData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {costMixData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderRadius: '8px',
                              border: 'none',
                              color: '#fff',
                              fontSize: '12px',
                            }}
                            formatter={(value: any) => [formatCurrency(Number(value) || 0), '']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      {costMixShares.map((item) => (
                        <div key={item.name} className="flex justify-between items-center text-xs gap-3">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                            <span className="text-slate-600 truncate">{item.name}</span>
                          </div>
                          <div className="flex items-baseline gap-3 shrink-0">
                            <span className="font-bold text-slate-900 font-mono tabular-nums">
                              {formatCurrency(item.value)}
                            </span>
                            <span className="font-bold text-slate-500 font-mono tabular-nums w-14 text-right">
                              {item.shareLabel}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                        <span className="font-black text-slate-900">{toGreekUpper('Συνολο')}</span>
                        <div className="flex items-baseline gap-3">
                          <span className="font-black text-slate-900 font-mono tabular-nums">
                            {formatCurrency(costMixTotal)}
                          </span>
                          <span className="font-black text-slate-500 font-mono tabular-nums w-14 text-right">100,0%</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 py-10 text-center">
                    {overviewPnl ? 'Δεν υπάρχουν καταχωρημένα έξοδα αυτόν τον μήνα.' : overviewError ? 'Η φόρτωση απέτυχε.' : 'Φόρτωση…'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Where the money went, by supplier */}
          {canManagePnl && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-indigo-600" />
                    <span>Έξοδα ανά Προμηθευτή</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {monthLabel(overviewMonth)} ·{' '}
                    {overviewScope === 'ALL'
                      ? 'Σύνολο Εταιρείας'
                      : stores.find((st) => st.id === overviewScope)?.name ?? ''}
                  </p>
                </div>
                <span className="text-sm font-black font-mono tabular-nums text-slate-900">
                  {formatCurrency(supplierTotal)}
                </span>
              </div>

              {supplierTotal > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={supplierShares}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={88}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {supplierShares.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderRadius: '8px',
                            border: 'none',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                          formatter={(value: any) => [formatCurrency(Number(value) || 0), '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-1.5">
                    {supplierShares.map((item) => (
                      <div key={item.name} className="flex justify-between items-center text-xs gap-3">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-slate-600 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-baseline gap-3 shrink-0">
                          <span className="font-bold text-slate-900 font-mono tabular-nums">
                            {formatCurrency(item.value)}
                          </span>
                          <span className="font-bold text-slate-500 font-mono tabular-nums w-14 text-right">
                            {item.shareLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-xs pt-2 mt-1 border-t border-slate-100">
                      <span className="font-black text-slate-900">{toGreekUpper('Συνολο')}</span>
                      <div className="flex items-baseline gap-3">
                        <span className="font-black text-slate-900 font-mono tabular-nums">
                          {formatCurrency(supplierTotal)}
                        </span>
                        <span className="font-black text-slate-500 font-mono tabular-nums w-14 text-right">100,0%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-10 text-center">
                  {overviewPnl
                    ? 'Δεν υπάρχουν καταχωρημένα έξοδα για αυτή την περίοδο.'
                    : overviewError
                    ? 'Η φόρτωση απέτυχε.'
                    : 'Φόρτωση…'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MONTHLY P&L (Owner only) */}
      {activeTab === 'COMMISSIONS' && canManagePnl && <CommissionEntrySheet />}

      {activeTab === 'PNL' && canManagePnl && <PnlWorkspace />}

      {/* TAB: DAILY AGGREGATION REPORT (ANTI-DOUBLE-COUNTING) */}
      {activeTab === 'DAILY_REPORT' && (
        <DailyAggregationView
          shifts={rawShifts}
          stores={stores}
          currentStoreId={selectedStoreId}
          onNavigate={onNavigate}
        />
      )}

      {/* TAB 3: EMPLOYEE KPIS & LEAGUE TABLE */}
      {activeTab === 'EMPLOYEE_KPIS' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-600" />
                  <span>Δείκτες Απόδοσης Εργαζομένων (Υπολογισμός από Βάρδιες & Ταμεία)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ενεργητική πώληση Σκρατς/h, FnB τζίρος, ακυρωτικά %, αποκλίσεις ταμείου, διαχείριση πιστώσεων.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="employee-kpi-search" className="sr-only">Αναζήτηση υπαλλήλου</label>
                <input
                  id="employee-kpi-search"
                  type="text"
                  placeholder="Αναζήτηση υπαλλήλου..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />

                <label htmlFor="employee-kpi-store-filter" className="sr-only">Φίλτρο καταστήματος</label>
                <select
                  id="employee-kpi-store-filter"
                  value={selectedFilterStore}
                  onChange={(e) => setSelectedFilterStore(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">Όλα τα Καταστήματα</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Εργαζόμενος</th>
                    <th className="py-3 px-3">Κατάστημα</th>
                    <th className="py-3 px-3 text-center">Βάρδιες / Ώρες</th>
                    <th className="py-3 px-3 text-right">Σκρατς Τζίρος (€)</th>
                    <th className="py-3 px-3 text-right">Σκρατς / Ώρα</th>
                    <th className="py-3 px-3 text-right">FnB Τζίρος (€)</th>
                    <th className="py-3 px-3 text-right">Ακυρώσεις %</th>
                    <th className="py-3 px-3 text-right">Συν. Απόκλιση Ταμείου</th>
                    <th className="py-3 px-3 text-center">Score Αξιοπιστίας</th>
                    <th className="py-3 px-3 text-right">Πιστώσεις (Δόθηκαν/Εισπρ.)</th>
                    <th className="py-3 px-3 text-right">Μ.Ο. Κλεισίματος</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-xs text-slate-500">
                        {employeeKpis.length === 0
                          ? 'Δεν υπάρχουν κλεισμένες βάρδιες ακόμα, οπότε δεν έχουν υπολογιστεί δείκτες εργαζομένων.'
                          : 'Δεν βρέθηκαν εργαζόμενοι με αυτά τα κριτήρια.'}
                      </td>
                    </tr>
                  )}
                  {filteredEmployees.map((e) => (
                    <tr key={e.employeeId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-extrabold">
                          {e.employeeName.charAt(0)}
                        </div>
                        <span>{e.employeeName}</span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">{e.storeName}</td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-700">
                        {e.totalShifts} βάρδ. ({e.totalHours}h)
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800">
                        {e.scratchTurnover > 0 ? formatCurrency(e.scratchTurnover) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-indigo-600">
                        {e.scratchPerHour > 0 ? `${formatCurrency(e.scratchPerHour)}/h` : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-amber-700 font-bold">
                        {e.fnbTurnover > 0 ? formatCurrency(e.fnbTurnover) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-700">
                        {e.cancellationRate}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono">
                        <span className={e.totalDiscrepancy === 0 ? 'text-slate-500 font-bold' : e.totalDiscrepancy > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {formatCurrency(e.totalDiscrepancy, { showSign: true })}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          e.reliabilityScore >= 98
                            ? 'bg-emerald-100 text-emerald-800'
                            : e.reliabilityScore >= 95
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {e.reliabilityScore}%
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-700">
                        {formatCurrency(e.activeCreditsGiven)} / {formatCurrency(e.creditsCollected)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                        {e.avgShiftClosingSpeedMinutes} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SHIFT KPIS & VLT RECONCILIATIONS */}
      {activeTab === 'SHIFT_KPIS' && (
        <div className="space-y-6">
          {/* Shift Benchmarks */}
          {shiftKpis.length === 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs text-center">
              <p className="text-xs text-slate-500">
                Δεν υπάρχουν κλεισμένες βάρδιες ακόμα. Οι δείκτες ανά βάρδια υπολογίζονται από τις πραγματικές βάρδιες.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shiftKpis.map((s, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>{s.shiftTypeName}</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {s.shiftType}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Μ.Ο. Τζίρου Βάρδιας:</span>
                    <span className="font-mono font-extrabold text-slate-900">{formatCurrency(s.avgRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">ΟΠΑΠ / VLTs / FnB:</span>
                    <span className="font-mono text-slate-700">{formatCurrency(s.avgOpapSales)} / {formatCurrency(s.avgVltNet)} / {formatCurrency(s.avgFnbSales)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Αναλογία Μετρητά / POS:</span>
                    <span className="font-mono font-bold text-indigo-600">{s.cashRatio}% Μετρητά / {s.posRatio}% POS</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Μ.Ο. Απόκλισης Ταμείου:</span>
                    <span className={`font-mono font-bold ${s.avgDiscrepancy >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(s.avgDiscrepancy, { showSign: true })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Έξοδα προς Τζίρο:</span>
                    <span className="font-mono text-slate-700">{s.avgExpensesToRevenue}%</span>
                  </div>
                  {s.peakHour && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Ώρες Αιχμής:</span>
                      <span className="font-bold text-slate-700">{s.peakHour}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* VLT Opapnet vs Shift Reconciliation Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <span>Εκκαθαρίσεις VLTs Opapnet vs Καταμέτρηση Ταμείου (Reconciliation Tracker)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Σύγκριση επίσημων δεδομένων εκκαθάρισης Opapnet με τις καταμετρήσεις βαρδιών. Εμφανίζονται και στη Διαχείριση Ταμείου του P&L.
                </p>
              </div>
              <button
                onClick={openVltModal}
                className="transition px-3.5 py-1.5 duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Καταχώρηση Εκκαθάρισης Opapnet</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Ημερομηνία Εκκαθάρισης</th>
                    <th className="py-3 px-3">Κατάστημα</th>
                    <th className="py-3 px-3 text-right">Ποσό Opapnet (€)</th>
                    <th className="py-3 px-3 text-right">Καταμέτρηση Βάρδιας (€)</th>
                    <th className="py-3 px-3 text-right">Διαφορά (€)</th>
                    <th className="py-3 px-4 text-center">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {vltReconciliations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500 font-sans">
                        Δεν υπάρχουν καταχωρημένες εκκαθαρίσεις Opapnet. Χρησιμοποιήστε το «Καταχώρηση Εκκαθάρισης Opapnet».
                      </td>
                    </tr>
                  )}
                  {vltReconciliations.map((v, idx) => (
                    <tr key={v.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-sans font-bold text-slate-900">{v.date}</td>
                      <td className="py-3.5 px-3 font-sans text-slate-600">{storeName(v.storeId)}</td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-800">
                        {v.status === 'PENDING' ? '—' : formatCurrency(v.opapnetAmount)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-800">{formatCurrency(v.countedAmount)}</td>
                      <td className={`py-3.5 px-3 text-right font-bold ${
                        v.status === 'PENDING' ? 'text-slate-500' : v.difference === 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {v.status === 'PENDING' ? '—' : formatCurrency(v.difference, { showSign: true })}
                      </td>
                      <td className="py-3.5 px-4 text-center font-sans">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          v.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : v.status === 'BALANCED' || v.difference === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {/* A count with no Allwynnet figure yet is not balanced - saying so
                              would claim a reconciliation that never happened. */}
                          {v.status === 'PENDING'
                            ? 'ΕΚΚΡΕΜΕΙ'
                            : v.status === 'BALANCED' || v.difference === 0
                            ? 'ΙΣΟΖΥΓΙΣΜΕΝΟ'
                            : 'ΑΠΟΚΛΙΣΗ'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add VLT Opapnet reconciliation */}
      <Modal
        isOpen={showVltModal}
        onClose={() => setShowVltModal(false)}
        title="Καταχώρηση Εκκαθάρισης VLT Opapnet"
        icon={Zap}
        iconClassName="text-purple-600"
        headerStyle="bordered"
        size="md"
        bodyAsForm
        onSubmit={handleSaveVltRec}
        footer={
          <ModalActions
            onCancel={() => setShowVltModal(false)}
            isSaving={isSavingRecord}
            saveLabel="Αποθήκευση Εκκαθάρισης"
          />
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="vlt-rec-store" className="block font-bold text-slate-700 mb-1">Κατάστημα</label>
              <select
                id="vlt-rec-store"
                required
                value={newVltRec.storeId}
                onChange={(e) => setNewVltRec({ ...newVltRec, storeId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
              >
                {!newVltRec.storeId && <option value="">— Επιλέξτε κατάστημα —</option>}
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vlt-rec-date" className="block font-bold text-slate-700 mb-1">Ημερομηνία Εκκαθάρισης</label>
              <input
                id="vlt-rec-date"
                type="date"
                required
                value={newVltRec.date}
                onChange={(e) => setNewVltRec({ ...newVltRec, date: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label htmlFor="vlt-rec-opapnet" className="block font-bold text-slate-700 mb-1">Ποσό Εκκαθάρισης Opapnet (€)</label>
            <NumericField
              id="vlt-rec-opapnet"
              required
              value={Number(newVltRec.opapnetAmount || '') || 0}
              onChange={(next) => setNewVltRec({ ...newVltRec, opapnetAmount: next })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
            />
          </div>

          <div>
            <label htmlFor="vlt-rec-counted" className="block font-bold text-slate-700 mb-1">Καταμέτρηση Ταμείου Βάρδιας (€)</label>
            <NumericField
              id="vlt-rec-counted"
              required
              value={Number(newVltRec.countedAmount || '') || 0}
              onChange={(next) => setNewVltRec({ ...newVltRec, countedAmount: next })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
