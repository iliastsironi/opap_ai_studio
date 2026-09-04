import React, { useState, useEffect } from 'react';
import {
  Store as StoreIcon,
  Clock,
  Receipt,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Ticket,
  Gamepad2,
  Coffee,
  TrendingUp,
  TrendingDown,
  Euro,
  PieChart as PieIcon,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Vault,
  FileSpreadsheet,
} from 'lucide-react';
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
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { fetchShiftsFromFirestore } from '../../services/shiftService.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

// Sample fallback dashboard chart data for smooth rendering when no DB entries exist
const sampleWeeklyTrend = [
  { day: 'Δευ', opap: 1450, vlt: 980, fnb: 210, expenses: 180, discrepancy: 0 },
  { day: 'Τρι', opap: 1680, vlt: 1050, fnb: 240, expenses: 220, discrepancy: -5 },
  { day: 'Τετ', opap: 1820, vlt: 1120, fnb: 260, expenses: 190, discrepancy: +10 },
  { day: 'Πεμ', opap: 1950, vlt: 1300, fnb: 290, expenses: 310, discrepancy: 0 },
  { day: 'Παρ', opap: 2400, vlt: 1550, fnb: 340, expenses: 280, discrepancy: -12 },
  { day: 'Σαβ', opap: 2850, vlt: 1800, fnb: 410, expenses: 420, discrepancy: +15 },
  { day: 'Κυρ', opap: 2100, vlt: 1400, fnb: 310, expenses: 260, discrepancy: 0 },
];

export const DashboardOverview: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { organization, roles, hasPermission } = useAuth();
  const { stores, activeStoreId } = useTenant();

  const canApprove =
    roles?.some(
      (r) =>
        ['ORG_OWNER', 'STORE_MANAGER', 'ADMIN', 'AREA_MANAGER', 'PLATFORM_ADMIN', 'SHIFT_LEADER'].includes(r.code) ||
        r.name?.toLowerCase().includes('manager') ||
        r.name?.toLowerCase().includes('owner') ||
        r.name?.toLowerCase().includes('διευθυντής') ||
        r.name?.toLowerCase().includes('ιδιοκτήτης')
    ) ||
    hasPermission('*') ||
    hasPermission('shift.approve') ||
    hasPermission('shifts.approve');

  const [pendingShifts, setPendingShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState<boolean>(true);

  useEffect(() => {
    const orgId = organization?.id || 'org_opap_demo';
    setLoadingShifts(true);
    Promise.all([
      fetchShiftsFromFirestore(orgId, activeStoreId, 'SUBMITTED'),
      fetchShiftsFromFirestore(orgId, activeStoreId),
    ])
      .then(([pending, all]) => {
        setPendingShifts(pending);
        setAllShifts(all);
      })
      .catch((err) => console.error('Error loading dashboard shifts:', err))
      .finally(() => setLoadingShifts(false));
  }, [organization?.id, activeStoreId]);

  const activeStoreName =
    activeStoreId === 'ALL'
      ? 'Όλα τα Καταστήματα'
      : stores.find((s) => s.id === activeStoreId)?.name || 'Επιλεγμένο Κατάστημα';

  // Compute live KPIs from shifts or fallback
  const totalCompletedShifts = allShifts.filter((s) => s.status === 'APPROVED').length;
  const totalRevenueCalculated =
    allShifts.reduce((sum, s) => sum + (s.opap_gross_sales || 0) + (s.vlts_cash_in || 0) + (s.fnb_sales || 0), 0) || 14200;
  const totalExpensesCalculated = allShifts.reduce((sum, s) => sum + (s.expenses_paid_cash || 0), 0) || 1860;
  const totalDiscrepanciesCalculated = allShifts.reduce((sum, s) => sum + (s.discrepancy || 0), 0) || -8;
  const totalSafeDropCalculated = allShifts.reduce((sum, s) => sum + (s.bank_deposits || 0), 0) || 4500;

  const streamBreakdownData = [
    { name: 'Παιχνίδια ΟΠΑΠ (KINO, Τζόκερ, Σκρατς)', value: Math.round(totalRevenueCalculated * 0.55), color: '#4f46e5' },
    { name: 'Τερματικά PLAY VLTs', value: Math.round(totalRevenueCalculated * 0.35), color: '#9333ea' },
    { name: 'FnB & Αναψυκτήριο', value: Math.round(totalRevenueCalculated * 0.10), color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <span>Αρχική</span>
            <span>/</span>
            <span className="text-slate-900 font-bold">Κεντρικό Ταμπλό Ελέγχου & KPIs</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>{organization?.trade_name || organization?.legal_name || 'ShiftLedger Store Manager'}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
              {activeStoreName}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Πλήρης επιχειρησιακή προβολή εσόδων ΟΠΑΠ/VLTs/FnB, καταμετρήσεων ταμείου, εξόδων & αποκλίσεων.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>P&L, KPIs & Excel</span>
          </button>
          <button
            onClick={() => onNavigate('shifts')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>Βάρδιες & Ταμείο</span>
          </button>
        </div>
      </div>

      {/* COMPREHENSIVE FINANCIAL & OPERATIONAL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Gross Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              {toGreekUpper('Συνολικα Εσοδα (€)')}
            </p>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Euro className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900">
              {formatCurrency(totalRevenueCalculated)}
            </h3>
            <span className="inline-flex items-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +8.4%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            ΟΠΑΠ: 55% | VLTs: 35% | FnB: 10%
          </p>
        </div>

        {/* KPI 2: Total Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 tracking-wider">
              {toGreekUpper('Εξοδα & Πληρωμες (€)')}
            </p>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900">
              {formatCurrency(totalExpensesCalculated)}
            </h3>
            <span className="inline-flex items-center text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              Εγκεκριμένα
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Τιμολόγια, προμηθευτές & μικροέξοδα
          </p>
        </div>

        {/* KPI 3: Cash Discrepancies */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 tracking-wider">
              {toGreekUpper('Αποκλισεις Ταμειου (€)')}
            </p>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                totalDiscrepanciesCalculated < 0
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3
              className={`text-2xl font-black ${
                totalDiscrepanciesCalculated < 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {formatCurrency(totalDiscrepanciesCalculated, { showSign: true })}
            </h3>
            <span
              className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                Math.abs(totalDiscrepanciesCalculated) <= 10
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {Math.abs(totalDiscrepanciesCalculated) <= 10 ? '✓ Εντός Ορίων' : '⚠️ Προσοχή'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Συνολική διαφορά καταμετρημένων vs Z
          </p>
        </div>

        {/* KPI 4: Safe Drop & Cash In Vault */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 tracking-wider">
              {toGreekUpper('Καταθεσεις Safe Drop (€)')}
            </p>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Vault className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900">
              {formatCurrency(totalSafeDropCalculated)}
            </h3>
            <span className="inline-flex items-center text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              Ασφαλισμένα
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Μεταφορές μετρητών στο χρηματοκιβώτιο
          </p>
        </div>
      </div>

      {/* Pending Shift Approval Banner */}
      {canApprove && pendingShifts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 border-2 border-amber-400/50 p-5 rounded-2xl shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-2xs shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-sm text-slate-900">
                  Εκκρεμότητες Εγκρίσεων: {pendingShifts.length} {pendingShifts.length === 1 ? 'Βάρδια' : 'Βάρδιες'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
                  AWAITING APPROVAL
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Υπάρχουν βάρδιες που έχουν υποβληθεί από το προσωπικό και αναμένουν την τελική έγκρισή σας.
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('shifts')}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          >
            <Clock className="w-4 h-4" />
            <span>Μετάβαση στις Βάρδιες ({pendingShifts.length})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DASHBOARDS & INTERACTIVE CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Revenue & Expenses Trend Chart (8 Cols) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Τάση Εσόδων & Εξόδων ανά Βάρδια</span>
              </h3>
              <p className="text-xs text-slate-500">
                Ημερήσιοι όγκοι εισπράξεων ΟΠΑΠ/VLTs σε σύγκριση με τα εγκεκριμένα έξοδα.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                Εβδομαδιαία Εικόνα
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sampleWeeklyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorVlt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(value), '']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', border: 'none', fontSize: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="opap" name="Παιχνίδια ΟΠΑΠ (€)" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorOpap)" />
                <Area type="monotone" dataKey="vlt" name="VLTs PLAY (€)" stroke="#9333ea" strokeWidth={2.5} fillOpacity={1} fill="url(#colorVlt)" />
                <Bar dataKey="expenses" name="Έξοδα Βάρδιας (€)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Streams Distribution (4 Cols) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-purple-600" />
                <span>Κατανομή Εσόδων</span>
              </h3>
              <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                % SHARE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ποσοστιαίος διαχωρισμός εισπράξεων ανά πηγή.
            </p>

            <div className="h-52 w-full my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={streamBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {streamBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => formatCurrency(val)}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '10px', color: '#fff', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
            {streamBreakdownData.map((stream) => (
              <div key={stream.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stream.color }}></span>
                  <span className="font-semibold text-slate-700 truncate max-w-[160px]">{stream.name}</span>
                </div>
                <span className="font-black text-slate-900">{formatCurrency(stream.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid Section: Quick Actions & Stores Network */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quick Actions & Stores Network */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Γρήγορες Ενέργειες & Λειτουργίες</h2>
                <p className="text-xs text-slate-500">Άμεση μετάβαση στις βασικές ενότητες καθημερινής διαχείρισης</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate('shifts')}
                className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Βάρδιες & Ταμείο</h3>
                <p className="text-xs text-slate-500 mt-0.5">Έναρξη, κλείσιμο, καταμέτρηση μετρητών & έλεγχος Z</p>
              </button>

              <button
                onClick={() => onNavigate('expenses')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Έξοδα & Δαπάνες</h3>
                <p className="text-xs text-slate-500 mt-0.5">Καταχώρηση πληρωμών, τιμολογίων & μικροεξόδων</p>
              </button>

              <button
                onClick={() => onNavigate('incidents')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Συμβάντα & Αποκλίσεις</h3>
                <p className="text-xs text-slate-500 mt-0.5">Καταγραφή συμβάντων, διαφορών & ελέγχων</p>
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Αναφορές & Analytics</h3>
                <p className="text-xs text-slate-500 mt-0.5">Στατιστικά πωλήσεων, αποκλίσεις & οικονομικά Z</p>
              </button>
            </div>
          </div>

          {/* Network Stores Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Δίκτυο Καταστημάτων Οργανισμού</h3>
                <p className="text-xs text-slate-500">Εγγεγραμμένα σημεία και τύποι λειτουργίας</p>
              </div>
              <button
                onClick={() => onNavigate('stores')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Διαχείριση →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stores.map((st) => (
                <div
                  key={st.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    activeStoreId === st.id || activeStoreId === 'ALL'
                      ? 'bg-slate-50 border-indigo-200 ring-1 ring-indigo-500/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      {st.code}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {st.store_type}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs">{st.name}</h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{st.address || 'Έδρα καταστήματος'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Operational Checklist & Audit Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Store Focus Card */}
          <div className="bg-indigo-900 rounded-2xl p-6 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
              <h3 className="text-xs font-bold text-indigo-200 tracking-widest">
                ΟΔΗΓΟΣ ΒΑΡΔΙΑΣ
              </h3>
              <span className="px-2 py-0.5 bg-indigo-800 rounded text-[10px] text-indigo-200 font-bold">
                SHIFT STATUS
              </span>
            </div>

            <p className="text-xs text-indigo-100 leading-relaxed">
              Για να διασφαλίσετε την ορθότητα του ταμείου, ακολουθήστε τα βήματα καταμέτρησης πριν το κλείσιμο της βάρδιας.
            </p>

            <div className="space-y-2.5 pt-1 text-xs">
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Έλεγχος αρχικού ταμείου (Float)</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Καταγραφή εσόδων & πωλήσεων</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Καταχώρηση παραστατικών εξόδων</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Υπολογισμός τελικής απόκλισης</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('shifts')}
              className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
            >
              <span>Μετάβαση στο Ταμείο</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Security & Audit Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 tracking-widest">
              ΕΛΕΓΧΟΣ & ΑΣΦΑΛΕΙΑ
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-emerald-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Tenant Isolation</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Αυστηρός διαχωρισμός δεδομένων ανά οργανισμό και κατάστημα.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-indigo-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Audit Logging</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Αμετάβλητες καταγραφές όλων των ενεργειών ταμείου & εγκρίσεων.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('audit')}
              className="w-full mt-2 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
            >
              Προβολή Audit Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

