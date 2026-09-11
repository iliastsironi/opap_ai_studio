import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
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
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Filter,
  Download,
  Store,
  CheckCircle2,
  PieChart as PieIcon,
  RefreshCw,
  Clock,
  Layers,
  Receipt,
  Percent,
  Users,
  Building2,
  FileSpreadsheet,
  Zap,
  ShieldCheck,
  Award,
  ChevronRight,
  Eye,
  ArrowUpRight,
  FileText,
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  Database,
  Check,
  HelpCircle,
  X,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchShiftsFromFirestore } from '../../services/shiftService.ts';
import { fetchExpensesFromFirestore } from '../../services/moduleServices.ts';
import {
  fetchFixedExpenses,
  saveFixedExpense,
  deleteFixedExpense,
  fetchCorporateExpenses,
  saveCorporateExpense,
  deleteCorporateExpense,
  fetchPayrollRecords,
  savePayrollRecord,
  fetchVltReconciliations,
  saveVltReconciliation,
  seedFinancialLedgerToFirestore,
} from '../../services/financialRecordsService.ts';
import { computeDynamicFinancials } from '../../services/kpiEngine.ts';
import { exportFullPnLWorkbook } from '../../services/excelExportService.ts';
import {
  StorePnLSummary,
  FixedExpenseItem,
  CorporateExpenseItem,
  PayrollEmployeeRecord,
  VltReconciliationRecord,
} from '../../data/pnlData.ts';
import { fetchUsersFromFirestore } from '../../services/userService.ts';
import { DailyAggregationView } from '../shifts/DailyAggregationView.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { pickNum, safeNum } from '../../services/financialCalculator.ts';

type ReportsTab = 'OVERVIEW' | 'PNL' | 'DAILY_REPORT' | 'EMPLOYEE_KPIS' | 'SHIFT_KPIS' | 'PAYROLL_FIXED';

const REPORTS_TABS: Array<{ id: ReportsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'OVERVIEW', label: 'Επισκόπηση & KPIs', icon: BarChart3 },
  { id: 'PNL', label: 'Συνολικό P&L Καταστημάτων', icon: Receipt },
  { id: 'DAILY_REPORT', label: 'Ημερήσιο Συγκεντρωτικό Βαρδιών', icon: Layers },
  { id: 'EMPLOYEE_KPIS', label: 'KPIs Εργαζομένων', icon: Users },
  { id: 'SHIFT_KPIS', label: 'KPIs Βαρδιών & VLTs Opapnet', icon: Clock },
  { id: 'PAYROLL_FIXED', label: 'Μισθοδοσία & Πάγια Έξοδα', icon: DollarSign },
];

export const ReportsManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { organization } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportsTab>('OVERVIEW');
  const [loading, setLoading] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);

  // Raw Data from Firestore
  const [rawShifts, setRawShifts] = useState<any[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [rawFixedExpenses, setRawFixedExpenses] = useState<FixedExpenseItem[]>([]);
  const [rawCorporateExpenses, setRawCorporateExpenses] = useState<CorporateExpenseItem[]>([]);
  const [rawPayroll, setRawPayroll] = useState<PayrollEmployeeRecord[]>([]);
  const [rawVltRecs, setRawVltRecs] = useState<VltReconciliationRecord[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);

  // Filtering
  const [selectedFilterStore, setSelectedFilterStore] = useState('ALL');
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Delete confirmation (Fixed / Corporate expense rows)
  const [pendingDelete, setPendingDelete] = useState<{ type: 'FIXED' | 'CORP'; id: string; label: string } | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  // Shared saving-state flag for the 5 Add-Record modals (only one can be open at a time)
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // Modals for Direct Entry
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [newFixedItem, setNewFixedItem] = useState<{ name: string; amounts: Record<string, number> }>({
    name: '',
    amounts: {},
  });

  const [showCorpModal, setShowCorpModal] = useState(false);
  const [newCorpItem, setNewCorpItem] = useState<Partial<CorporateExpenseItem>>({
    category: 'Εταιρικά Έξοδα',
    name: '',
    amount: 0,
  });

  const [showVltModal, setShowVltModal] = useState(false);
  const [newVltRec, setNewVltRec] = useState<Partial<VltReconciliationRecord>>({
    date: new Date().toLocaleDateString('el-GR'),
    opapnetAmount: 0,
    countedAmount: 0,
    difference: 0,
    status: 'BALANCED',
  });

  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [newPayrollItem, setNewPayrollItem] = useState<Partial<PayrollEmployeeRecord>>({
    name: '',
    storeName: '',
    storeId: '',
    email: '',
    baseSalary: 950,
    daysWorked: 26,
    hoursWorked: 208,
    overtimeHours: 0,
    bonus: 0,
    bankAmount: 850,
    advancePayment: 0,
    cashInHand: 100,
  });

  const orgId = organization?.id || 'org_opap_demo';

  // Load all Firestore Collections
  const loadAllFinancialData = async () => {
    setLoading(true);
    try {
      const [shifts, exp, fixed, corp, pay, vlt, users] = await Promise.all([
        fetchShiftsFromFirestore(orgId, selectedStoreId === 'ALL' ? undefined : selectedStoreId),
        fetchExpensesFromFirestore(orgId, selectedStoreId === 'ALL' ? undefined : selectedStoreId),
        fetchFixedExpenses(orgId),
        fetchCorporateExpenses(orgId),
        fetchPayrollRecords(orgId),
        fetchVltReconciliations(orgId),
        fetchUsersFromFirestore(orgId),
      ]);

      setRawShifts(shifts || []);
      setRawExpenses(exp || []);
      setRawFixedExpenses(fixed || []);
      setRawCorporateExpenses(corp || []);
      setRawPayroll(pay || []);
      setRawVltRecs(vlt || []);
      if (users && users.length > 0) {
        setTenantUsers(users);
      }
    } catch (err) {
      console.error('Error loading financial analytics from Firestore:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllFinancialData();
  }, [orgId, selectedStoreId]);

  // Seed sample ledger data directly to Firestore
  const handleSeedData = async () => {
    setSeedingLoading(true);
    try {
      const ok = await seedFinancialLedgerToFirestore(orgId);
      if (ok) {
        setSeedSuccessMessage('Όλες οι καταχωρήσεις P&L, Παγίων, Μισθοδοσίας & VLTs συγχρονίστηκαν επιτυχώς στο Firestore!');
        setTimeout(() => setSeedSuccessMessage(null), 4000);
        await loadAllFinancialData();
      }
    } finally {
      setSeedingLoading(false);
    }
  };

  // Dynamically compute all derived metrics & statements from live Firestore data
  const dynamicCalculations = useMemo(() => {
    return computeDynamicFinancials({
      shifts: rawShifts,
      expenses: rawExpenses,
      fixedExpenses: rawFixedExpenses,
      corporateExpenses: rawCorporateExpenses,
      payrollRecords: rawPayroll,
      vltReconciliations: rawVltRecs,
      rosterSchedules: [],
      stores: stores.map((s) => ({ id: s.id, name: s.name, code: s.code, store_type: s.store_type })),
    });
  }, [rawShifts, rawExpenses, rawFixedExpenses, rawCorporateExpenses, rawPayroll, rawVltRecs, stores]);

  const {
    pnlSummary,
    employeeKpis,
    shiftKpis,
    storeKpis,
    fixedExpenses,
    corporateExpenses,
    payrollRecords,
    vltReconciliations,
    totals,
  } = dynamicCalculations;

  // Chart cost distribution
  const costDistributionData = [
    { name: 'Πάγια Έξοδα Καταστημάτων', value: totals.fixedExpenses, color: '#f59e0b' },
    { name: 'Έξοδα Ημέρας & Προμηθευτές', value: totals.dailyExpenses, color: '#ef4444' },
    { name: 'Μισθοδοσία Προσωπικού', value: totals.payroll, color: '#8b5cf6' },
    { name: 'Έξοδα Εταιρίας & Διοίκησης', value: totals.corporateExpenses, color: '#3b82f6' },
  ];

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

  // Handlers for adding/editing records
  const handleSaveFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixedItem.name) return;
    // Always write an amount for every real store (defaulting to 0) so
    // clearing a store's field actually zeroes it out server-side, rather
    // than leaving a stale prior value in place.
    const amounts: Record<string, number> = {};
    stores.forEach((s) => {
      amounts[s.id] = Number(newFixedItem.amounts[s.id] || 0);
    });
    const total = Object.values(amounts).reduce((sum, v) => sum + v, 0);
    const item: FixedExpenseItem = {
      name: newFixedItem.name,
      amounts,
      total,
    };
    setIsSavingRecord(true);
    try {
      await saveFixedExpense(orgId, item);
      setShowFixedModal(false);
      setNewFixedItem({ name: '', amounts: {} });
      await loadAllFinancialData();
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteFixedExpense = (id: string, name: string) => {
    setPendingDelete({ type: 'FIXED', id, label: name });
  };

  const handleSaveCorpExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCorpItem.name || !newCorpItem.amount) return;
    const item: CorporateExpenseItem = {
      category: newCorpItem.category || 'Εταιρικά Έξοδα',
      name: newCorpItem.name,
      amount: Number(newCorpItem.amount || 0),
    };
    setIsSavingRecord(true);
    try {
      await saveCorporateExpense(orgId, item);
      setShowCorpModal(false);
      setNewCorpItem({ category: 'Εταιρικά Έξοδα', name: '', amount: 0 });
      await loadAllFinancialData();
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteCorpExpense = (id: string, name: string) => {
    setPendingDelete({ type: 'CORP', id, label: name });
  };

  const handleConfirmPendingDelete = async () => {
    if (!pendingDelete) return;
    setIsDeletingRecord(true);
    try {
      if (pendingDelete.type === 'FIXED') {
        await deleteFixedExpense(pendingDelete.id);
      } else {
        await deleteCorporateExpense(pendingDelete.id);
      }
      await loadAllFinancialData();
      setPendingDelete(null);
    } finally {
      setIsDeletingRecord(false);
    }
  };

  const handleSaveVltRec = async (e: React.FormEvent) => {
    e.preventDefault();
    const opap = Number(newVltRec.opapnetAmount || 0);
    const counted = Number(newVltRec.countedAmount || 0);
    const diff = counted - opap;
    const rec: VltReconciliationRecord = {
      date: newVltRec.date || new Date().toLocaleDateString('el-GR'),
      opapnetAmount: opap,
      countedAmount: counted,
      difference: diff,
      status: Math.abs(diff) < 0.01 ? 'BALANCED' : 'DISCREPANCY',
    };
    setIsSavingRecord(true);
    try {
      await saveVltReconciliation(orgId, rec);
      setShowVltModal(false);
      await loadAllFinancialData();
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayrollItem.name) return;
    const base = Number(newPayrollItem.baseSalary || 0);
    const bonus = Number(newPayrollItem.bonus || 0);
    const advance = Number(newPayrollItem.advancePayment || 0);
    const bank = Number(newPayrollItem.bankAmount || 0);
    const total = base + bonus;
    const hand = total - bank - advance;

    const item: PayrollEmployeeRecord = {
      employeeId: `emp_${Date.now()}`,
      name: newPayrollItem.name,
      email: newPayrollItem.email || '',
      storeName: newPayrollItem.storeName || stores[0]?.name || '',
      storeId: newPayrollItem.storeId || stores[0]?.id || '',
      baseSalary: base,
      daysWorked: Number(newPayrollItem.daysWorked ?? 26),
      hoursWorked: Number(newPayrollItem.hoursWorked ?? 208),
      overtimeHours: Number(newPayrollItem.overtimeHours || 0),
      bonus,
      totalPayroll: total,
      bankAmount: bank,
      advancePayment: advance,
      cashInHand: hand,
    };
    setIsSavingRecord(true);
    try {
      await savePayrollRecord(orgId, item);
      setShowPayrollModal(false);
      await loadAllFinancialData();
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleExportExcel = () => {
    exportFullPnLWorkbook({
      month: '09',
      year: '2024',
      pnlData: pnlSummary,
      fixedExpenses,
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      payroll: payrollRecords,
      employeeKpis,
      shiftKpis,
      storeKpis,
    });
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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Στατιστικά, KPIs & Οικονομικό P&L</h1>
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Live Dynamic Ledger
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Όλα τα στοιχεία (P&L, KPIs εργαζομένων/βαρδιών, μισθοδοσία, VLTs, πάγια) αντλούνται <strong>άμεσα & έμμεσα από καταχωρήσεις στο Firestore</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadAllFinancialData}
            disabled={loading}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Ανανέωση δεδομένων από τις πρόσφατες καταχωρήσεις"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Ανανέωση</span>
          </button>

          <button
            onClick={handleSeedData}
            disabled={seedingLoading}
            className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Αρχικοποίηση/Συγχρονισμός όλων των καταχωρήσεων Σεπτεμβρίου 2024 στο Firestore"
          >
            <Database className={`w-3.5 h-3.5 ${seedingLoading ? 'animate-spin' : ''}`} />
            <span>{seedingLoading ? 'Συγχρονισμός...' : 'Συγχρονισμός Βάσης'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-2 cursor-pointer"
            title="Εξαγωγή πλήρους αρχείου Excel με όλα τα φύλλα"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Εξαγωγή Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {seedSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800 font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{seedSuccessMessage}</span>
          </div>
          <button onClick={() => setSeedSuccessMessage(null)} aria-label="Κλείσιμο" className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap gap-1">
        {REPORTS_TABS.map(({ id, label, icon: Icon }) => (
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
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Revenue */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-indigo-200 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Συνολικός Τζίρος</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1.5 tracking-tight">{formatCurrency(totals.turnover)}</h3>
                </div>
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Από {rawShifts.length > 0 ? rawShifts.length : 120} βάρδιες
                </span>
                <span className="text-slate-400 font-medium">Όλα τα stores</span>
              </div>
            </div>

            {/* Card 2: Total Expenses */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-rose-200 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Συνολικά Έξοδα (OPEX)</p>
                  <h3 className="text-2xl font-black text-rose-600 mt-1.5 tracking-tight">
                    {formatCurrency(totals.dailyExpenses + totals.fixedExpenses + totals.payroll + totals.corporateExpenses)}
                  </h3>
                </div>
                <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100/80">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Πάγια + Ημέρας + Μισθοδοσία</span>
                <span className="font-bold text-slate-700">{formatCurrency(totals.fixedExpenses + totals.dailyExpenses)}</span>
              </div>
            </div>

            {/* Card 3: Net Cash Profit */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-emerald-200 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Καθαρά Κέρδη προ Φόρων</p>
                  <h3 className={`text-2xl font-black mt-1.5 tracking-tight ${totals.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(totals.netProfit)}
                  </h3>
                </div>
                <div className={`p-2.5 rounded-xl border ${totals.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100/80' : 'bg-rose-50 text-rose-600 border-rose-100/80'}`}>
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Περιθώριο Καθαρού Κέρδους</span>
                <span className="font-bold text-emerald-700">
                  {totals.turnover > 0 ? ((totals.netProfit / totals.turnover) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
            </div>

            {/* Card 4: Discrepancy & Shrinkage Rate */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-indigo-200 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Δείκτης Απωλειών (Shrinkage)</p>
                  <h3 className="text-2xl font-black text-indigo-600 mt-1.5 tracking-tight">{totals.shrinkageRate}%</h3>
                </div>
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Σύνολο Αποκλίσεων</span>
                <span className={`font-bold ${totals.totalDiscrepancy === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(totals.totalDiscrepancy, { showSign: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Daily Revenue & Expenses Trend */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span>Ημερήσια Εξέλιξη Τζίρου & Εσόδων (Από Βάρδιες Firestore)</span>
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

            {/* Chart 2: Cost Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-purple-600" />
                  <span>Κατανομή Εξόδων (Cost Mix)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Πάγια, Έξοδα Ημέρας, Μισθοδοσία & Εταιρικά</p>
              </div>

              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {costDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                {costDistributionData.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="text-slate-600 truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Store Benchmarking KPIs Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Συγκριτικοί Δείκτες Απόδοσης ανά Κατάστημα (Store KPIs)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Win/Machine/Day, OPEX %, FnB Margin, Εκκρεμείς Πιστώσεις και Καθαρή Κερδοφορία
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Κατάστημα</th>
                    <th className="py-3 px-3">Τύπος</th>
                    <th className="py-3 px-3 text-right">GGR (€)</th>
                    <th className="py-3 px-3 text-right">NGR (€)</th>
                    <th className="py-3 px-3 text-right">Win/VLT/Ημέρα</th>
                    <th className="py-3 px-3 text-right">OPEX %</th>
                    <th className="py-3 px-3 text-right">Περιθώριο FnB</th>
                    <th className="py-3 px-3 text-right">Shrinkage %</th>
                    <th className="py-3 px-3 text-right">Επισφαλείς Πιστώσεις</th>
                    <th className="py-3 px-3 text-right">Καθαρά Κέρδη (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {storeKpis.map((st) => (
                    <tr key={st.storeId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{st.storeName}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{st.storeType}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">{formatCurrency(st.ggr)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">{formatCurrency(st.ngr)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-600">
                        {st.vltWinPerMachine > 0 ? formatCurrency(st.vltWinPerMachine) : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">{st.opexToRevenue}%</td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 font-bold">{st.fnbMargin}%</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">{st.shrinkageRate}%</td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600">{formatCurrency(st.outstandingCredits)}</td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-600">{formatCurrency(st.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: P&L SUMMARY STATEMENT */}
      {activeTab === 'PNL' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>Συνολική Κατάσταση Αποτελεσμάτων (Profit & Loss - P&L)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Δυναμική συγκέντρωση τζίρου, εξόδων ημέρας, παγίων, μισθοδοσίας & εταιρικών υποχρεώσεων από τις καταχωρήσεις.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Εξαγωγή Φύλλου P&L</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3.5 px-4 rounded-l-lg">Κατάστημα</th>
                    <th className="py-3.5 px-3 text-right">Τζίρος (€)</th>
                    <th className="py-3.5 px-3 text-right">Έξοδα Ημέρας (€)</th>
                    <th className="py-3.5 px-3 text-right">Πάγια Έξοδα (€)</th>
                    <th className="py-3.5 px-3 text-right">Μισθοδοσία (€)</th>
                    <th className="py-3.5 px-3 text-right">Έξοδα Εταιρίας (€)</th>
                    <th className="py-3.5 px-3 text-right">Δάνεια (€)</th>
                    <th className="py-3.5 px-4 text-right rounded-r-lg">Κέρδη προ Φόρων (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {pnlSummary.map((row) => (
                    <tr key={row.storeId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{row.storeName}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-800">
                        {row.turnover > 0 ? formatCurrency(row.turnover) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-rose-600">
                        {row.dailyExpenses > 0 ? formatCurrency(row.dailyExpenses) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-rose-600">
                        {row.fixedExpenses > 0 ? formatCurrency(row.fixedExpenses) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-purple-600">
                        {row.payroll > 0 ? formatCurrency(row.payroll) : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-500">-</td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-500">-</td>
                      <td className={`py-3.5 px-4 text-right font-mono font-extrabold ${row.profitBeforeTax >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(row.profitBeforeTax)}
                      </td>
                    </tr>
                  ))}
                  {/* Corporate & Loans Row */}
                  <tr className="bg-slate-50/50">
                    <td className="py-3.5 px-4 font-bold text-slate-600">Κεντρικά Έξοδα Εταιρίας & Διοίκηση</td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">-</td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">-</td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">-</td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">-</td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-blue-600">{formatCurrency(totals.corporateExpenses)}</td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">{formatCurrency(0)}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600">{formatCurrency(-totals.corporateExpenses)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900 text-xs">
                    <td className="py-4 px-4 uppercase tracking-wider">Γενικό Σύνολο Οργανισμού</td>
                    <td className="py-4 px-3 text-right font-mono">{formatCurrency(totals.turnover)}</td>
                    <td className="py-4 px-3 text-right font-mono text-rose-700">{formatCurrency(totals.dailyExpenses)}</td>
                    <td className="py-4 px-3 text-right font-mono text-rose-700">{formatCurrency(totals.fixedExpenses)}</td>
                    <td className="py-4 px-3 text-right font-mono text-purple-700">{formatCurrency(totals.payroll)}</td>
                    <td className="py-4 px-3 text-right font-mono text-blue-700">{formatCurrency(totals.corporateExpenses)}</td>
                    <td className="py-4 px-3 text-right font-mono">{formatCurrency(0)}</td>
                    <td className="py-4 px-4 text-right font-mono text-rose-700 text-sm">
                      {formatCurrency(totals.netProfit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: DAILY AGGREGATION REPORT (ANTI-DOUBLE-COUNTING) */}
      {activeTab === 'DAILY_REPORT' && (
        <DailyAggregationView
          shifts={rawShifts}
          stores={stores}
          currentStoreId={selectedStoreId}
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
                  <option value="100343">100343 (ΟΠΑΠ)</option>
                  <option value="100343_FnB">100343 FnB</option>
                  <option value="PlayOpap_400298">Play 400298</option>
                  <option value="100411">100411 (ΟΠΑΠ)</option>
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
                  Σύγκριση επίσημων δεδομένων εκκαθάρισης Opapnet με τις καταμετρήσεις βαρδιών στο Firestore.
                </p>
              </div>
              <button
                onClick={() => setShowVltModal(true)}
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

      {/* TAB 5: PAYROLL & FIXED EXPENSES */}
      {activeTab === 'PAYROLL_FIXED' && (
        <div className="space-y-6">
          {/* Payroll Breakdown Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Αναλυτική Μισθοδοσία Προσωπικού (Καταχωρήσεις Firestore)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Βασικός μισθός, ημέρες, ώρες, υπερωρίες, bonus, πληρωμές τραπέζης, προκαταβολές και στο χέρι.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!newPayrollItem.storeId) {
                    const firstStore = stores[0];
                    setNewPayrollItem((prev) => ({ ...prev, storeId: firstStore?.id || '', storeName: firstStore?.name || '' }));
                  }
                  setShowPayrollModal(true);
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Εργαζομένου Μισθοδοσίας</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Εργαζόμενος</th>
                    <th className="py-3 px-3">Κατάστημα</th>
                    <th className="py-3 px-3">E-mail</th>
                    <th className="py-3 px-3 text-right">Βασικός (€)</th>
                    <th className="py-3 px-3 text-center">Ημέρες / Ώρες</th>
                    <th className="py-3 px-3 text-right">Bonus (€)</th>
                    <th className="py-3 px-3 text-right">Σύνολο (€)</th>
                    <th className="py-3 px-3 text-right">Σε Τράπεζα (€)</th>
                    <th className="py-3 px-3 text-right">Προκαταβολή (€)</th>
                    <th className="py-3 px-4 text-right">Στο Χέρι (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollRecords.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors font-mono">
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">{p.name}</td>
                      <td className="py-3 px-3 font-sans text-slate-600">{p.storeName}</td>
                      <td className="py-3 px-3 font-sans text-slate-500 text-[11px]">{p.email}</td>
                      <td className="py-3 px-3 text-right text-slate-700">{formatCurrency(p.baseSalary)}</td>
                      <td className="py-3 px-3 text-center text-slate-600">{p.daysWorked}ημ / {p.hoursWorked}h</td>
                      <td className="py-3 px-3 text-right text-emerald-600 font-bold">{p.bonus > 0 ? formatCurrency(p.bonus) : '-'}</td>
                      <td className="py-3 px-3 text-right font-extrabold text-slate-900">{formatCurrency(p.totalPayroll)}</td>
                      <td className="py-3 px-3 text-right text-blue-600 font-bold">{formatCurrency(p.bankAmount)}</td>
                      <td className="py-3 px-3 text-right text-amber-600 font-bold">{p.advancePayment > 0 ? formatCurrency(p.advancePayment) : '-'}</td>
                      <td className="py-3 px-4 text-right text-purple-600 font-bold">{p.cashInHand > 0 ? formatCurrency(p.cashInHand) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fixed Expenses Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Πάγια Έξοδα Καταστημάτων (Καταχωρήσεις Firestore)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ενοίκια, Ύδρευση, OTE VPN, Εφημερίδες, ΕΦΚΑ & Λοιπές Συμβατικές Υποχρεώσεις
                </p>
              </div>
              <button
                onClick={() => setShowFixedModal(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Παγίου Εξόδου</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Έξοδο / Πάγιο</th>
                    {stores.map((s) => (
                      <th key={s.id} className="py-3 px-3 text-right">{s.name} (€)</th>
                    ))}
                    <th className="py-3 px-3 text-right">Σύνολο (€)</th>
                    <th className="py-3 px-3 text-center">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {fixedExpenses.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">{f.name}</td>
                      {stores.map((s) => (
                        <td key={s.id} className="py-3 px-3 text-right text-slate-700">
                          {f.amounts[s.id] > 0 ? formatCurrency(f.amounts[s.id]) : '-'}
                        </td>
                      ))}
                      <td className="py-3 px-3 text-right font-extrabold text-rose-600">{formatCurrency(f.total)}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDeleteFixedExpense(f.id, f.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                          title="Διαγραφή παγίου"
                          aria-label="Διαγραφή παγίου"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Corporate Expenses & Loans Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span>Έξοδα Εταιρίας & Δάνεια (Corporate Obligations)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Αμοιβές Εταίρων, ΕΦΚΑ, Εφορίες & Τραπεζικές Δόσεις Δανείων
                </p>
              </div>
              <button
                onClick={() => setShowCorpModal(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Εταιρικού Εξόδου</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">Κατηγορία</th>
                    <th className="py-3 px-3">Περιγραφή / Δικαιούχος</th>
                    <th className="py-3 px-3 text-right">Ποσό (€)</th>
                    <th className="py-3 px-3 text-center">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {corporateExpenses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-medium">{c.category}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-blue-600">{formatCurrency(c.amount)}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDeleteCorpExpense(c.id, c.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                          title="Διαγραφή εταιρικού εξόδου"
                          aria-label="Διαγραφή εταιρικού εξόδου"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
      {/* MODAL 1: ADD FIXED STORE EXPENSE */}
      {/* ========================================================================= */}
      {showFixedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Καταχώρηση Νέου Παγίου Εξόδου Καταστημάτων</span>
              </h3>
              <button onClick={() => setShowFixedModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFixedExpense} className="space-y-4 text-xs">
              <div>
                <label htmlFor="fixed-exp-name" className="block font-bold text-slate-700 mb-1">Περιγραφή Παγίου Εξόδου</label>
                <input
                  id="fixed-exp-name"
                  type="text"
                  required
                  placeholder="π.χ. Ενοίκιο, ΕΥΔΑΠ, OTE VPN, TV/Nova, Λογιστής..."
                  value={newFixedItem.name}
                  onChange={(e) => setNewFixedItem({ ...newFixedItem, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stores.map((s) => (
                  <div key={s.id}>
                    <label htmlFor={`fixed-exp-${s.id}`} className="block font-bold text-slate-700 mb-1">{s.name} (€)</label>
                    <input
                      id={`fixed-exp-${s.id}`}
                      type="number"
                      step="0.01"
                      value={newFixedItem.amounts[s.id] || ''}
                      onChange={(e) => setNewFixedItem({
                        ...newFixedItem,
                        amounts: { ...newFixedItem.amounts, [s.id]: parseFloat(e.target.value) || 0 },
                      })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFixedModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingRecord ? 'Αποθήκευση...' : 'Αποθήκευση στο Firestore'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD CORPORATE EXPENSE / LOAN */}
      {/* ========================================================================= */}
      {showCorpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Καταχώρηση Εταιρικού Εξόδου ή Δανείου</span>
              </h3>
              <button onClick={() => setShowCorpModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCorpExpense} className="space-y-4 text-xs">
              <div>
                <label htmlFor="corp-exp-category" className="block font-bold text-slate-700 mb-1">Κατηγορία</label>
                <select
                  id="corp-exp-category"
                  value={newCorpItem.category}
                  onChange={(e) => setNewCorpItem({ ...newCorpItem, category: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                >
                  <option value="Εταιρικά Έξοδα">Εταιρικά Έξοδα / Διοίκηση</option>
                  <option value="ΕΦΚΑ Εταιρίας">ΕΦΚΑ Εταιρίας / Εταίρων</option>
                  <option value="Φόροι & Τέλη">Φόροι & Τέλη</option>
                  <option value="Δάνεια & Τραπεζικές Δόσεις">Δάνεια & Τραπεζικές Δόσεις</option>
                </select>
              </div>

              <div>
                <label htmlFor="corp-exp-name" className="block font-bold text-slate-700 mb-1">Περιγραφή / Δικαιούχος</label>
                <input
                  id="corp-exp-name"
                  type="text"
                  required
                  placeholder="π.χ. Μ_Νίκος, Δάνειο ΕΤΕ, ΕΦΚΑ Μ_Περικλής..."
                  value={newCorpItem.name}
                  onChange={(e) => setNewCorpItem({ ...newCorpItem, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="corp-exp-amount" className="block font-bold text-slate-700 mb-1">Ποσό (€)</label>
                <input
                  id="corp-exp-amount"
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={newCorpItem.amount || ''}
                  onChange={(e) => setNewCorpItem({ ...newCorpItem, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCorpModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingRecord ? 'Αποθήκευση...' : 'Αποθήκευση στο Firestore'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD VLT OPAPNET RECONCILIATION */}
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
              <div>
                <label htmlFor="vlt-rec-date" className="block font-bold text-slate-700 mb-1">Ημερομηνία Εκκαθάρισης</label>
                <input
                  id="vlt-rec-date"
                  type="text"
                  required
                  placeholder="π.χ. 1/9/2024"
                  value={newVltRec.date}
                  onChange={(e) => setNewVltRec({ ...newVltRec, date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
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

      {/* ========================================================================= */}
      {/* MODAL 4: ADD PAYROLL EMPLOYEE RECORD */}
      {/* ========================================================================= */}
      {showPayrollModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Προσθήκη Εργαζομένου στη Μισθοδοσία</span>
              </h3>
              <button onClick={() => setShowPayrollModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayroll} className="space-y-4 text-xs">
              <div>
                <label htmlFor="payroll-user-select" className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Επιλογή Εργαζομένου (από Χρήστες)</span>
                  <span className="text-[10px] text-indigo-600 font-semibold">Λίστα Προσωπικού</span>
                </label>
                <select
                  id="payroll-user-select"
                  value={newPayrollItem.name || ''}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    const matchedUser = tenantUsers.find(
                      (u) => `${u.first_name} ${u.last_name}` === selectedName || u.id === selectedName
                    );
                    if (matchedUser) {
                      const fullName = `${matchedUser.first_name} ${matchedUser.last_name}`;
                      const userStore = matchedUser.stores?.[0]?.store_name || '100343 (ΟΠΑΠ)';
                      setNewPayrollItem({
                        ...newPayrollItem,
                        name: fullName,
                        email: matchedUser.email || '',
                        storeName: userStore,
                      });
                    } else {
                      setNewPayrollItem({ ...newPayrollItem, name: selectedName });
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                >
                  <option value="">-- Επιλέξτε Εργαζόμενο / Χρήστη --</option>
                  <optgroup label="Εγγεγραμμένοι Χρήστες Οργανισμού">
                    {tenantUsers.map((u) => {
                      const fullName = `${u.first_name} ${u.last_name}`;
                      return (
                        <option key={u.id} value={fullName}>
                          {fullName} — {u.role_name || u.role_code || 'Υπάλληλος'} ({u.email})
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payroll-name" className="block font-bold text-slate-700 mb-1">Ονοματεπώνυμο (ή Προσαρμογή)</label>
                  <input
                    id="payroll-name"
                    type="text"
                    required
                    placeholder="π.χ. Γιάννης Παπαδόπουλος"
                    value={newPayrollItem.name || ''}
                    onChange={(e) => setNewPayrollItem({ ...newPayrollItem, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="payroll-store" className="block font-bold text-slate-700 mb-1">Κατάστημα</label>
                  <select
                    id="payroll-store"
                    value={newPayrollItem.storeId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matching = stores.find((s) => s.id === val);
                      setNewPayrollItem({ ...newPayrollItem, storeId: val, storeName: matching ? matching.name : val });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                  >
                    {!newPayrollItem.storeId && <option value="">— Επιλέξτε κατάστημα —</option>}
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="payroll-base" className="block font-bold text-slate-700 mb-1">Βασικός (€)</label>
                  <input
                    id="payroll-base"
                    type="number"
                    step="0.01"
                    value={newPayrollItem.baseSalary || ''}
                    onChange={(e) => setNewPayrollItem({ ...newPayrollItem, baseSalary: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="payroll-bonus" className="block font-bold text-slate-700 mb-1">Bonus (€)</label>
                  <input
                    id="payroll-bonus"
                    type="number"
                    step="0.01"
                    value={newPayrollItem.bonus || ''}
                    onChange={(e) => setNewPayrollItem({ ...newPayrollItem, bonus: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="payroll-advance" className="block font-bold text-slate-700 mb-1">Προκαταβολή (€)</label>
                  <input
                    id="payroll-advance"
                    type="number"
                    step="0.01"
                    value={newPayrollItem.advancePayment || ''}
                    onChange={(e) => setNewPayrollItem({ ...newPayrollItem, advancePayment: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payroll-bank" className="block font-bold text-slate-700 mb-1">Κατάθεση σε Τράπεζα (€)</label>
                  <input
                    id="payroll-bank"
                    type="number"
                    step="0.01"
                    value={newPayrollItem.bankAmount || ''}
                    onChange={(e) => setNewPayrollItem({ ...newPayrollItem, bankAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ημέρες / Ώρες</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Ημέρες"
                      aria-label="Ημέρες Εργασίας"
                      value={newPayrollItem.daysWorked ?? 26}
                      onChange={(e) => setNewPayrollItem({ ...newPayrollItem, daysWorked: parseInt(e.target.value) || 0 })}
                      className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                    <input
                      type="number"
                      placeholder="Ώρες"
                      aria-label="Ώρες Εργασίας"
                      value={newPayrollItem.hoursWorked ?? 208}
                      onChange={(e) => setNewPayrollItem({ ...newPayrollItem, hoursWorked: parseInt(e.target.value) || 0 })}
                      className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayrollModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingRecord ? 'Αποθήκευση...' : 'Αποθήκευση στη Μισθοδοσία'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Delete Expense Confirmation Modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">
                {pendingDelete.type === 'FIXED' ? 'Διαγραφή Παγίου Εξόδου' : 'Διαγραφή Εταιρικού Εξόδου'}
              </h4>
            </div>
            <p className="text-xs text-slate-600">
              Είστε σίγουροι ότι θέλετε να διαγράψετε «{pendingDelete.label}»; Η ενέργεια είναι οριστική.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={handleConfirmPendingDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingRecord ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Διαγραφή...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ναι, Διαγραφή</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
