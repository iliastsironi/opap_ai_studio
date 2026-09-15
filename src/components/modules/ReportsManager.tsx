import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
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
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchShiftsFromFirestore } from '../../services/shiftService.ts';
import { fetchVltReconciliations, saveVltReconciliation } from '../../services/financialRecordsService.ts';
import { computeDynamicFinancials } from '../../services/kpiEngine.ts';
import { VltReconciliationRecord } from '../../data/pnlData.ts';
import { DailyAggregationView } from '../shifts/DailyAggregationView.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { athensDateKey, currentMonthKey, monthLabel, totalCosts } from '../../lib/pnlEngine.ts';
import { pickNum, safeNum } from '../../services/financialCalculator.ts';
import { PnlWorkspace } from '../pnl/PnlWorkspace.tsx';
import { percentLabel } from '../pnl/pnlDisplay.tsx';
import { useMonthlyPnl } from '../pnl/useMonthlyPnl.ts';

type ReportsTab = 'OVERVIEW' | 'PNL' | 'DAILY_REPORT' | 'EMPLOYEE_KPIS' | 'SHIFT_KPIS';

// Owner-only, like the RLS on the P&L tables.
const PNL_PERMISSION = 'pnl.manage';

const REPORTS_TABS: Array<{ id: ReportsTab; label: string; icon: LucideIcon; permission?: string }> = [
  { id: 'OVERVIEW', label: 'Επισκόπηση & KPIs', icon: BarChart3 },
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

  const orgId = organization?.id || 'org_opap_demo';

  // This month's money cards come from the P&L, so they share its Owner-only access.
  const overviewMonth = useMemo(() => currentMonthKey(), []);
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

  const costMixData = overviewPnl
    ? [
        { name: 'Έξοδα Ημέρας & F&B', value: overviewPnl.storesTotal.dailyExpenses, color: '#ef4444' },
        { name: 'Πάγια Καταστημάτων', value: overviewPnl.storesTotal.fixedCosts, color: '#f59e0b' },
        { name: 'Μισθοδοσία', value: overviewPnl.storesTotal.payroll, color: '#8b5cf6' },
        { name: 'Έξοδα Εταιρίας', value: overviewPnl.companyExpenses, color: '#3b82f6' },
        { name: 'Δάνεια', value: overviewPnl.loans, color: '#64748b' },
      ]
    : [];
  const hasCosts = costMixData.some((item) => item.value > 0);
  const discrepantShifts = rawShifts.filter((s) => Math.abs(Number(s.discrepancy || 0)) >= 1).length;

  // Shift performance chart data
  const shiftChartData = rawShifts.length > 0
    ? rawShifts.slice(0, 15).reverse().map((s) => ({
        date: new Date(s.opened_at || s.closed_at || Date.now()).toLocaleDateString('el-GR', { month: 'numeric', day: 'numeric' }),
        revenue: Number(s.opap_gross_sales || 0) + Number(s.vlts_cash_in || 0) + Number(s.fnb_sales || 0),
        vlt: pickNum(s.vlts_net, safeNum(s.vlts_cash_in) - safeNum(s.vlts_cash_out)),
        expenses: Number(s.expenses_paid_cash || 0),
      }))
    : [
        { date: '1/9', revenue: 2850, vlt: 1000, expenses: 320 },
        { date: '2/9', revenue: 3100, vlt: 1050, expenses: 380 },
        { date: '3/9', revenue: 2640, vlt: 980, expenses: 290 },
        { date: '4/9', revenue: 3420, vlt: 1200, expenses: 410 },
        { date: '5/9', revenue: 3890, vlt: 1380, expenses: 450 },
        { date: '6/9', revenue: 4120, vlt: 1400, expenses: 490 },
        { date: '7/9', revenue: 2980, vlt: 1040, expenses: 340 },
      ];

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
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
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
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${canManagePnl ? 'lg:grid-cols-4' : ''}`}>
            {canManagePnl ? (
              <>
                <OverviewCard
                  label={`Τζίρος · ${monthLabel(overviewMonth)}`}
                  value={overviewPnl ? formatCurrency(overviewPnl.storesTotal.revenue) : pendingValue}
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
                  value={overviewPnl ? formatCurrency(totalCosts(overviewPnl)) : pendingValue}
                  valueClass="text-rose-600"
                  icon={Receipt}
                  iconClass="bg-rose-50 text-rose-600 border-rose-100/80"
                  footer={<span>Ημέρας, πάγια, μισθοδοσία, εταιρίας και δάνεια</span>}
                />
                <OverviewCard
                  label="Καθαρό αποτέλεσμα προ φόρων"
                  value={overviewPnl ? formatCurrency(overviewPnl.netResult) : pendingValue}
                  valueClass={overviewPnl && overviewPnl.netResult < 0 ? 'text-rose-600' : 'text-emerald-600'}
                  icon={Wallet}
                  iconClass={
                    overviewPnl && overviewPnl.netResult < 0
                      ? 'bg-rose-50 text-rose-600 border-rose-100/80'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-100/80'
                  }
                  footer={
                    <>
                      <span>Περιθώριο · {monthLabel(overviewMonth)}</span>
                      <span className="font-bold text-slate-700">
                        {overviewPnl && overviewPnl.storesTotal.revenue > 0
                          ? percentLabel(overviewPnl.netResult / overviewPnl.storesTotal.revenue)
                          : '—'}
                      </span>
                    </>
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
              label="Δείκτης Απωλειών (Shrinkage)"
              value={`${String(totals.shrinkageRate).replace('.', ',')}%`}
              valueClass="text-indigo-600"
              icon={ShieldCheck}
              iconClass="bg-indigo-50 text-indigo-600 border-indigo-100/80"
              footer={
                <>
                  <span>Σύνολο Αποκλίσεων</span>
                  <span className={`font-bold ${totals.totalDiscrepancy === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(totals.totalDiscrepancy, { showSign: true })}
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
                    <span>Ημερήσια Εξέλιξη Τζίρου & Εσόδων (Από Βάρδιες)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Έσοδα ΟΠΑΠ, Net VLTs και έξοδα ανά βάρδια
                  </p>
                </div>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={shiftChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorVlt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9333ea" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#9333ea" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(value: any) => [formatCurrency(Number(value) || 0), '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Συνολικά Έσοδα (€)"
                      stroke="#4f46e5"
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="vlt"
                      name="VLTs Net (€)"
                      stroke="#9333ea"
                      fillOpacity={1}
                      fill="url(#colorVlt)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
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
                      {costMixData.map((item) => (
                        <div key={item.name} className="flex justify-between items-center text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                            <span className="text-slate-600 truncate max-w-[150px]">{item.name}</span>
                          </div>
                          <span className="font-bold text-slate-900">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
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
        </div>
      )}

      {/* TAB 2: MONTHLY P&L (Owner only) */}
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
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Ώρες Αιχμής:</span>
                    <span className="font-bold text-slate-700">{s.peakHour}</span>
                  </div>
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
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
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
                  {vltReconciliations.map((v, idx) => (
                    <tr key={v.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-sans font-bold text-slate-900">{v.date}</td>
                      <td className="py-3.5 px-3 font-sans text-slate-600">{storeName(v.storeId)}</td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-800">{formatCurrency(v.opapnetAmount)}</td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-800">{formatCurrency(v.countedAmount)}</td>
                      <td className={`py-3.5 px-3 text-right font-bold ${v.difference === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(v.difference, { showSign: true })}
                      </td>
                      <td className="py-3.5 px-4 text-center font-sans">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          v.status === 'BALANCED' || v.difference === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {v.status === 'BALANCED' || v.difference === 0 ? 'ΙΣΟΖΥΓΙΣΜΕΝΟ' : 'ΑΠΟΚΛΙΣΗ'}
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

      {/* ========================================================================= */}
      {/* MODAL: ADD VLT OPAPNET RECONCILIATION */}
      {/* ========================================================================= */}
      {showVltModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-600" />
                <span>Καταχώρηση Εκκαθάρισης VLT Opapnet</span>
              </h3>
              <button onClick={() => setShowVltModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVltRec} className="space-y-4 text-xs">
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
                <input
                  id="vlt-rec-opapnet"
                  type="number"
                  step="0.01"
                  required
                  value={newVltRec.opapnetAmount || ''}
                  onChange={(e) => setNewVltRec({ ...newVltRec, opapnetAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label htmlFor="vlt-rec-counted" className="block font-bold text-slate-700 mb-1">Καταμέτρηση Ταμείου Βάρδιας (€)</label>
                <input
                  id="vlt-rec-counted"
                  type="number"
                  step="0.01"
                  required
                  value={newVltRec.countedAmount || ''}
                  onChange={(e) => setNewVltRec({ ...newVltRec, countedAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVltModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingRecord ? 'Αποθήκευση...' : 'Αποθήκευση Εκκαθάρισης'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
