import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  ShieldCheck,
  TrendingUp,
  Coins,
  ArrowRight,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Receipt,
  UserCheck,
  CreditCard,
  DollarSign,
  HelpCircle,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import { Shift } from '../../types/index.ts';
import {
  DailyAggregatedReport,
  aggregateShiftsForDay,
  groupShiftsByDayAndStore,
  exportDailyReportToCsv,
  formatGreekDate,
  getShiftDateKey,
} from '../../services/dailyAggregationService.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';

interface DailyAggregationViewProps {
  shifts: Shift[];
  stores: Array<{ id: string; name: string; code?: string }>;
  currentStoreId?: string;
  onOpenShiftDetails?: (shift: Shift) => void;
}

export const DailyAggregationView: React.FC<DailyAggregationViewProps> = ({
  shifts,
  stores,
  currentStoreId,
  onOpenShiftDetails,
}) => {
  const [selectedStore, setSelectedStore] = useState<string>(currentStoreId || 'ALL');
  
  // Available dates from shifts
  const groupedReports = useMemo(() => {
    return groupShiftsByDayAndStore(shifts, selectedStore);
  }, [shifts, selectedStore]);

  const availableDates = useMemo(() => {
    return Object.keys(groupedReports);
  }, [groupedReports]);

  // Default to newest date available, or today
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const todayKey = getShiftDateKey();
    if (availableDates.includes(todayKey)) return todayKey;
    return availableDates[0] || todayKey;
  });

  // Keep selectedDate updated if availableDates changes and current selection not in list
  React.useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  // Current report for the selected day
  const dailyReport: DailyAggregatedReport = useMemo(() => {
    return aggregateShiftsForDay(shifts, selectedDate, selectedStore);
  }, [shifts, selectedDate, selectedStore]);

  // Quick navigation date helpers
  const handleJumpDate = (offset: number) => {
    const currentIndex = availableDates.indexOf(selectedDate);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex - offset; // availableDates is desc
    if (nextIndex >= 0 && nextIndex < availableDates.length) {
      setSelectedDate(availableDates[nextIndex]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isToday = selectedDate === getShiftDateKey();
  const yesterdayKey = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0];
  const isYesterday = selectedDate === yesterdayKey;

  return (
    <div className="space-y-6">
      {/* Top Filter & Date Selector Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white shadow-xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Ημερήσιο Συγκεντρωτικό Βαρδιών & Ταμείου
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                  ANTI-DOUBLE-COUNTING ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Αυτόματη συγκέντρωση πωλήσεων και καθαρού ισοζυγίου χωρίς διπλομέτρηση αρχικών & τελικών ταμείων.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportDailyReportToCsv(dailyReport)}
              disabled={dailyReport.totalShiftsCount === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Εξαγωγή Αναφοράς σε CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Εξαγωγή CSV</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={dailyReport.totalShiftsCount === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Εκτύπωση Ημερήσιου Δελτίου"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Εκτύπωση Z</span>
            </button>
          </div>
        </div>

        {/* Date Selector bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick date pills */}
            <button
              onClick={() => setSelectedDate(getShiftDateKey())}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                isToday
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Σήμερα
            </button>

            <button
              onClick={() => setSelectedDate(yesterdayKey)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                isYesterday
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Χθες
            </button>

            {/* Custom date input */}
            <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="daily-agg-date" className="sr-only">Επιλογή ημερομηνίας</label>
              <input
                id="daily-agg-date"
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
              />
            </div>

            {/* Previous/Next date buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleJumpDate(-1)}
                title="Προηγούμενη Ημέρα με Βάρδιες"
                aria-label="Προηγούμενη Ημέρα με Βάρδιες"
                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleJumpDate(1)}
                title="Επόμενη Ημέρα με Βάρδιες"
                aria-label="Επόμενη Ημέρα με Βάρδιες"
                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Store Filter */}
          <div className="flex items-center space-x-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 cursor-pointer"
            >
              <option value="ALL">Όλα τα Καταστήματα</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code || st.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Anti-Double-Counting Explainer Banner */}
      <div className="bg-indigo-950 text-white rounded-2xl p-4 sm:p-5 border border-indigo-800 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-indigo-800/20 to-transparent pointer-events-none" />
        <div className="flex items-start space-x-3.5 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-extrabold text-white">
                Κανόνας Αποτροπής Διπλομέτρησης (Anti Double-Counting Engine)
              </h4>
            </div>
            <p className="text-xs text-indigo-200/90 leading-relaxed">
              Για την ημέρα <strong>{dailyReport.formattedDate}</strong>, το <strong>Αρχικό Ταμείο ({formatCurrency(dailyReport.initialOpeningCash)})</strong> υπολογίζεται αποκλειστικά από την <em>1η βάρδια</em> κάθε ταμείου και το <strong>Τελικό Ταμείο ({formatCurrency(dailyReport.finalCountedCash)})</strong> από την <em>τελευταία βάρδια</em>. Όλοι οι τζίροι (ΟΠΑΠ, VLTs, Σκρατς, TORA, FnB), τα έξοδα και οι καταθέσεις αθροίζονται πλήρως και ανεξάρτητα.
            </p>
          </div>
        </div>
      </div>

      {dailyReport.totalShiftsCount === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-2xs">
          <Clock className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-700">
            Δεν υπάρχουν καταγεγραμμένες βάρδιες για την ημέρα {formatGreekDate(selectedDate)}
          </p>
          <p className="text-xs text-slate-400">
            Επιλέξτε άλλη ημερομηνία από το παραπάνω ημερολόγιο ή αλλάξτε το φίλτρο καταστήματος.
          </p>
        </div>
      ) : (
        <>
          {/* Main 4 KPI Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Gross Sales Turnover */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Συνολικός Τζίρος (Gross)
                </span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {formatCurrency(dailyReport.totalGrossTurnover)}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ΟΠΑΠ + VLTs + Σκρατς + TORA + FnB ({dailyReport.totalShiftsCount} βάρδιες)
                </p>
              </div>
            </div>

            {/* KPI 2: Net Cash Generated */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Καθαρή Είσπραξη Ημέρας
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {formatCurrency(dailyReport.totalNetCashActivity)}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Καθαρά έσοδα μείον έξοδα & πιστώσεις
                </p>
              </div>
            </div>

            {/* KPI 3: Safe / Bank Outflows */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Καταθέσεις / Χρηματοκιβώτιο
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-blue-700 font-mono">
                  {formatCurrency(dailyReport.totalBankDeposits)}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Μεταφορές μετρητών εκτός ταμείου
                </p>
              </div>
            </div>

            {/* KPI 4: Daily Discrepancy */}
            <div
              className={`p-4.5 rounded-2xl border shadow-2xs space-y-2 ${
                dailyReport.dailyDiscrepancy === 0
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : dailyReport.dailyDiscrepancy < 0
                  ? 'bg-rose-50/60 border-rose-200'
                  : 'bg-amber-50/60 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Ημερήσια Απόκλιση
                </span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    dailyReport.dailyDiscrepancy === 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {dailyReport.dailyDiscrepancy === 0 ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>
              </div>
              <div>
                <span
                  className={`text-2xl font-black font-mono ${
                    dailyReport.dailyDiscrepancy < 0
                      ? 'text-rose-700'
                      : dailyReport.dailyDiscrepancy > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(dailyReport.dailyDiscrepancy, { showSign: true })}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {dailyReport.dailyDiscrepancy === 0
                    ? 'Απόλυτη ταμειακή ισορροπία'
                    : dailyReport.dailyDiscrepancy < 0
                    ? 'Έλλειμμα ταμείου'
                    : 'Πλεόνασμα ταμείου'}
                </p>
              </div>
            </div>
          </div>

          {/* Daily Cash Reconciliation Step-by-Step Flow */}
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 shadow-sm space-y-4 print:bg-white print:border-slate-300 print:[&_*]:text-black print:[&_*]:bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">
                  Ημερήσιο Ισοζύγιο Ταμείου & Συμφωνία Μετρητών
                </h4>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {dailyReport.totalShiftsCount} Βάρδιες • {dailyReport.registersCount} Ταμείο(α)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {/* Step 1: Initial Float */}
              <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">
                  1. Αρχικό Ταμείο (1η Βάρδια)
                </span>
                <span className="text-base font-black font-mono text-white block">
                  {formatCurrency(dailyReport.initialOpeningCash)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Αφετηρία ημέρας χωρίς διπλομέτρηση
                </span>
              </div>

              {/* Step 2: Net Sales Inflow */}
              <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">
                  2. (+) Καθαρά Έσοδα Πωλήσεων
                </span>
                <span className="text-base font-black font-mono text-emerald-400 block">
                  +{formatCurrency(
                    dailyReport.totalOpapNet +
                    dailyReport.totalVltsNet +
                    dailyReport.totalScratchSales +
                    dailyReport.totalToraPos +
                    dailyReport.totalCleverPoint +
                    dailyReport.totalFnbCash
                  )}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Όλες οι εισπράξεις μετρητών
                </span>
              </div>

              {/* Step 3: Outflows (Expenses & Deposits) */}
              <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider block">
                  3. (-) Έξοδα & Καταθέσεις
                </span>
                <span className="text-base font-black font-mono text-rose-400 block">
                  -{formatCurrency(dailyReport.totalExpensesPaidCash + dailyReport.totalBankDeposits)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Έξοδα: {formatCurrency(dailyReport.totalExpensesPaidCash)} | Καταθέσεις:{' '}
                  {formatCurrency(dailyReport.totalBankDeposits)}
                </span>
              </div>

              {/* Step 4: Expected Closing */}
              <div className="bg-indigo-950/80 p-3 rounded-xl border border-indigo-700/70 space-y-1">
                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">
                  4. (=) Αναμενόμενο Τελικό
                </span>
                <span className="text-base font-black font-mono text-indigo-200 block">
                  {formatCurrency(dailyReport.dailyExpectedClosingDrawer)}
                </span>
                <span className="text-[10px] text-indigo-300/80 block">
                  Αρχικό + Καθαρά - Έξοδα - Drops
                </span>
              </div>

              {/* Step 5: Actual Counted */}
              <div
                className={`p-3 rounded-xl border space-y-1 ${
                  dailyReport.dailyDiscrepancy === 0
                    ? 'bg-emerald-950/70 border-emerald-700/70'
                    : 'bg-rose-950/70 border-rose-700/70'
                }`}
              >
                <span className="text-[10px] text-slate-200 font-bold uppercase tracking-wider block">
                  5. (vs) Πραγματικό Καταμετρημένο
                </span>
                <span className="text-base font-black font-mono text-white block">
                  {formatCurrency(dailyReport.finalCountedCash)}
                </span>
                <span className="text-[10px] font-bold block text-emerald-300">
                  Διαφορά: {formatCurrency(dailyReport.dailyDiscrepancy, { showSign: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Matrix Comparison Table: Shift 1 vs Shift 2 vs Shift 3 vs Daily Total */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-3">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>Συγκριτικός Πίνακας Βαρδιών & Ημερήσιο Άθροισμα</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Αναλυτική συνεισφορά κάθε βάρδιας στις επιμέρους γραμμές εσόδων, εξόδων και ταμείου.
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                {dailyReport.formattedDate}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4 min-w-[200px]">Οικονομική Κατηγορία</th>
                    {dailyReport.shiftContributions.map((s, idx) => (
                      <th key={s.shiftId} className="py-3 px-3.5 text-right min-w-[130px]">
                        <div>
                          {s.shiftType === 'MORNING'
                            ? 'Πρωινή'
                            : s.shiftType === 'AFTERNOON'
                            ? 'Απογευματινή'
                            : 'Βραδινή'}
                        </div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {s.openedBy} ({s.registerId})
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right bg-indigo-50/70 text-indigo-950 font-black min-w-[150px] border-l border-indigo-100">
                      {toGreekUpper('Ημερησιο Συνολο')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                  {/* OPAP Gross */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-bold text-slate-900">ΟΠΑΠ Μικτές Εισπράξεις (Gross)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.opapGross)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalOpapGross)}
                    </td>
                  </tr>

                  {/* OPAP Payouts */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-rose-700">ΟΠΑΠ Πληρωμές Κερδών (Payouts)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-rose-700">
                        -{formatCurrency(s.opapPayouts)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-bold bg-indigo-50/40 text-rose-700 border-l border-indigo-100">
                      -{formatCurrency(dailyReport.totalOpapPayouts)}
                    </td>
                  </tr>

                  {/* OPAP Net */}
                  <tr className="bg-slate-50/40 font-bold">
                    <td className="py-2 px-4 text-indigo-900">↳ ΟΠΑΠ Καθαρά (Net)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2 px-3.5 text-right font-mono text-indigo-900">
                        {formatCurrency(s.opapNet)}
                      </td>
                    ))}
                    <td className="py-2 px-4 text-right font-mono font-black bg-indigo-50/70 text-indigo-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalOpapNet)}
                    </td>
                  </tr>

                  {/* VLTs Net */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      VLTs / Megaplus (In: {formatCurrency(dailyReport.totalVltsCashIn)} | Out:{' '}
                      {formatCurrency(dailyReport.totalVltsCashOut)})
                    </td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.vltsNet)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalVltsNet)}
                    </td>
                  </tr>

                  {/* Scratch & Lotteries */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">Σκρατς & Λαχεία (Scratch / Lotteries)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.scratchSales)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalScratchSales)}
                    </td>
                  </tr>

                  {/* Tora POS */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">TORA Direct POS (Πληρωμές Λογαριασμών)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.toraPos)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalToraPos)}
                    </td>
                  </tr>

                  {/* Clever Point */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">Clever Point (Δέματα / Υπηρεσίες)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.cleverPoint)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalCleverPoint)}
                    </td>
                  </tr>

                  {/* FnB Sales */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      Καφέ / FnB (Μετρητά: {formatCurrency(dailyReport.totalFnbCash)} | POS:{' '}
                      {formatCurrency(dailyReport.totalFnbCard)})
                    </td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono">
                        {formatCurrency(s.fnbSales)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-slate-900 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalFnbSales)}
                    </td>
                  </tr>

                  {/* POS Payments */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-slate-600">
                      Συνολικές Εισπράξεις μέσω POS (Τραπεζικών Καρτών)
                    </td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-slate-600">
                        {formatCurrency(s.cardPayments)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-bold bg-indigo-50/40 text-slate-700 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalCardPayments)}
                    </td>
                  </tr>

                  {/* Expenses Paid Cash */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-rose-700">Έξοδα Πληρωτέα από Ταμείο (Expenses)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-rose-700">
                        -{formatCurrency(s.expenses)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-rose-700 border-l border-indigo-100">
                      -{formatCurrency(dailyReport.totalExpensesPaidCash)}
                    </td>
                  </tr>

                  {/* Customer Credits */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-amber-800">
                      Πιστώσεις Πελατών (Χορηγήσεις: -{formatCurrency(dailyReport.totalCreditGranted)} | Εισπράξεις: +{formatCurrency(dailyReport.totalCreditCollected)})
                    </td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-amber-800">
                        {formatCurrency(s.creditCollected - s.creditGranted)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-amber-800 border-l border-indigo-100">
                      {formatCurrency(dailyReport.totalCreditCollected - dailyReport.totalCreditGranted)}
                    </td>
                  </tr>

                  {/* Bank Deposits / Safe Drops */}
                  <tr className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-blue-700">Καταθέσεις σε Χρηματοκιβώτιο / Bank Drops</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-blue-700">
                        -{formatCurrency(s.bankDeposits)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-50/40 text-blue-700 border-l border-indigo-100">
                      -{formatCurrency(dailyReport.totalBankDeposits)}
                    </td>
                  </tr>

                  {/* Divider */}
                  <tr className="bg-slate-200/80">
                    <td colSpan={dailyReport.shiftContributions.length + 2} className="py-1 px-4 text-[10px] font-black uppercase tracking-wider text-slate-600">
                      ΣΥΜΦΩΝΙΑ ΤΑΜΕΙΟΥ & ΑΠΟΚΛΙΣΕΙΣ (ΜΕ ΠΡΟΣΤΑΣΙΑ ΔΙΠΛΟΜΕΤΡΗΣΗΣ)
                    </td>
                  </tr>

                  {/* Initial Float (Anti-Double-Counted) */}
                  <tr className="bg-indigo-50/30">
                    <td className="py-2.5 px-4 font-extrabold text-indigo-950">
                      Αρχικό Ταμείο (Initial Float)
                      <span className="block text-[10px] font-normal text-indigo-600">
                        *Μόνο 1η βάρδια ανά ταμείο
                      </span>
                    </td>
                    {dailyReport.shiftContributions.map((s, idx) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-slate-600">
                        {idx === 0 ? (
                          <span className="font-black text-indigo-900">{formatCurrency(s.openingCash)}</span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            {formatCurrency(s.openingCash)} (μεταφορά)
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-100/70 text-indigo-950 border-l border-indigo-200">
                      {formatCurrency(dailyReport.initialOpeningCash)}
                    </td>
                  </tr>

                  {/* Final Drawer Counted (Anti-Double-Counted) */}
                  <tr className="bg-indigo-50/30">
                    <td className="py-2.5 px-4 font-extrabold text-indigo-950">
                      Τελικό Ταμείο Συρταριού (Final Counted)
                      <span className="block text-[10px] font-normal text-indigo-600">
                        *Τελευταία βάρδια ανά ταμείο
                      </span>
                    </td>
                    {dailyReport.shiftContributions.map((s, idx) => (
                      <td key={s.shiftId} className="py-2.5 px-3.5 text-right font-mono text-slate-600">
                        {idx === dailyReport.shiftContributions.length - 1 ? (
                          <span className="font-black text-indigo-900">{formatCurrency(s.countedCash)}</span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            {formatCurrency(s.countedCash)} (παράδοση)
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-black bg-indigo-100/70 text-indigo-950 border-l border-indigo-200">
                      {formatCurrency(dailyReport.finalCountedCash)}
                    </td>
                  </tr>

                  {/* Shift Discrepancy */}
                  <tr className="bg-slate-100/90 font-black">
                    <td className="py-3 px-4 text-slate-900">Απόκλιση Ταμείου (Discrepancy)</td>
                    {dailyReport.shiftContributions.map((s) => (
                      <td
                        key={s.shiftId}
                        className={`py-3 px-3.5 text-right font-mono ${
                          s.discrepancy < 0
                            ? 'text-rose-600'
                            : s.discrepancy > 0
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {formatCurrency(s.discrepancy, { showSign: true })}
                      </td>
                    ))}
                    <td
                      className={`py-3 px-4 text-right font-mono font-black text-sm border-l border-slate-300 ${
                        dailyReport.dailyDiscrepancy < 0
                          ? 'bg-rose-100 text-rose-800'
                          : dailyReport.dailyDiscrepancy > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {formatCurrency(dailyReport.dailyDiscrepancy, { showSign: true })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Quick Shift Inspection Link Cards */}
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Μεμονωμένες Βάρδιες Ημέρας:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {dailyReport.shiftContributions.map((s) => {
                    const originalShift = shifts.find((orig) => orig.id === s.shiftId);
                    return (
                      <button
                        key={s.shiftId}
                        onClick={() => originalShift && onOpenShiftDetails?.(originalShift)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          {s.shiftType === 'MORNING'
                            ? 'Πρωινή'
                            : s.shiftType === 'AFTERNOON'
                            ? 'Απογευματινή'
                            : 'Βραδινή'}{' '}
                          ({s.openedBy})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
