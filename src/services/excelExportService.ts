import * as XLSX from 'xlsx';
import {
  DEFAULT_PNL_SUMMARY,
  FIXED_EXPENSES_LIST,
  CORPORATE_EXPENSES_LIST,
  PAYROLL_EMPLOYEES_LIST,
  EMPLOYEE_KPIS_SAMPLE,
  SHIFT_KPIS_SAMPLE,
  STORE_KPIS_SAMPLE,
  WEEKLY_ROSTER_SAMPLE,
  VLT_RECONCILIATIONS_SAMPLE,
} from '../data/pnlData.ts';

export interface ExportExcelOptions {
  month?: string;
  year?: string;
  pnlData?: typeof DEFAULT_PNL_SUMMARY;
  fixedExpenses?: typeof FIXED_EXPENSES_LIST;
  payroll?: typeof PAYROLL_EMPLOYEES_LIST;
  employeeKpis?: typeof EMPLOYEE_KPIS_SAMPLE;
  shiftKpis?: typeof SHIFT_KPIS_SAMPLE;
  storeKpis?: typeof STORE_KPIS_SAMPLE;
}

export function exportFullPnLWorkbook(options: ExportExcelOptions = {}) {
  const pnlData = options.pnlData || DEFAULT_PNL_SUMMARY;
  const fixedExpenses = options.fixedExpenses || FIXED_EXPENSES_LIST;
  const payroll = options.payroll || PAYROLL_EMPLOYEES_LIST;
  const employeeKpis = options.employeeKpis || EMPLOYEE_KPIS_SAMPLE;
  const shiftKpis = options.shiftKpis || SHIFT_KPIS_SAMPLE;
  const storeKpis = options.storeKpis || STORE_KPIS_SAMPLE;

  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Συνολική_P&L (Profit & Loss Statement)
  // -------------------------------------------------------------
  const pnlHeaders = [
    ['ShiftLedger - Συνολική Κατάσταση Αποτελεσμάτων (Profit & Loss)'],
    ['Περίοδος: 09/2024 | Εταιρεία: ShiftLedger Operations | Εμπιστευτικό'],
    [],
    ['Κατάστημα', 'Τζίρος (€)', 'Έξοδα Ημέρας (€)', 'Πάγια Έξοδα (€)', 'Μισθοδοσία (€)', 'Έξοδα Εταιρίας (€)', 'Δάνεια (€)', 'Κέρδη προ Φόρων (€)'],
  ];

  const pnlRows = pnlData.map((row) => [
    row.storeName,
    row.turnover,
    row.dailyExpenses,
    row.fixedExpenses,
    row.payroll,
    row.corporateExpenses,
    row.loans,
    row.profitBeforeTax,
  ]);

  const totalTurnover = pnlData.reduce((acc, r) => acc + r.turnover, 0);
  const totalDailyExpenses = pnlData.reduce((acc, r) => acc + r.dailyExpenses, 0);
  const totalFixedExpenses = pnlData.reduce((acc, r) => acc + r.fixedExpenses, 0);
  const totalPayroll = pnlData.reduce((acc, r) => acc + r.payroll, 0);
  const totalCorp = 1741.00;
  const totalLoans = 0.00;
  const totalProfit = totalTurnover - totalDailyExpenses - totalFixedExpenses - totalPayroll - totalCorp - totalLoans;

  const pnlTotalRow = [
    'Σύνολο Οργανισμού',
    totalTurnover,
    totalDailyExpenses,
    totalFixedExpenses,
    totalPayroll,
    totalCorp,
    totalLoans,
    totalProfit,
  ];

  const wsPnl = XLSX.utils.aoa_to_sheet([...pnlHeaders, ...pnlRows, [], pnlTotalRow]);
  XLSX.utils.book_append_sheet(wb, wsPnl, 'Συνολική_P&L');

  // -------------------------------------------------------------
  // Sheet 2: KPIs Εργαζομένων & Βαρδιών (Comprehensive KPIs)
  // -------------------------------------------------------------
  const kpiHeaders = [
    ['ShiftLedger - Δείκτες Απόδοσης (KPIs) Ανά Εργαζόμενο, Βάρδια & Κατάστημα'],
    ['1. ΔΕΙΚΤΕΣ ΑΠΟΔΟΣΗΣ ΑΝΑ ΕΡΓΑΖΟΜΕΝΟ (Employee KPIs)'],
    [
      'Εργαζόμενος',
      'Κατάστημα',
      'Βάρδιες',
      'Ώρες',
      'Σκρατς/Λαχεία (€)',
      'Σκρατς/Ώρα (€/h)',
      'FnB Τζίρος (€)',
      'Ακυρωτικά (%)',
      'Συν. Απόκλιση (€)',
      'Βάρδιες με Απόκλιση',
      'Score Αξιοπιστίας (%)',
      'Πιστώσεις που Δόθηκαν (€)',
      'Πιστώσεις που Εισπράχθηκαν (€)',
      'Μ.Ο. Χρόνου Κλεισίματος (min)',
    ],
  ];

  const kpiEmployeeRows = employeeKpis.map((e) => [
    e.employeeName,
    e.storeName,
    e.totalShifts,
    e.totalHours,
    e.scratchTurnover,
    e.scratchPerHour,
    e.fnbTurnover,
    `${e.cancellationRate}%`,
    e.totalDiscrepancy,
    e.discrepantShiftsCount,
    `${e.reliabilityScore}%`,
    e.activeCreditsGiven,
    e.creditsCollected,
    e.avgShiftClosingSpeedMinutes,
  ]);

  const kpiShiftSection = [
    [],
    ['2. ΔΕΙΚΤΕΣ ΑΠΟΔΟΣΗΣ ΑΝΑ ΤΥΠΟ ΒΑΡΔΙΑΣ (Shift KPIs)'],
    ['Τύπος Βάρδιας', 'Μ.Ο. Τζίρου (€)', 'ΟΠΑΠ (€)', 'VLTs Net (€)', 'FnB (€)', 'Μετρητά (%)', 'POS (%)', 'Μ.Ο. Απόκλισης (€)', 'Έξοδα/Τζίρος (%)', 'Ώρες Αιχμής'],
  ];

  const kpiShiftRows = shiftKpis.map((s) => [
    s.shiftTypeName,
    s.avgRevenue,
    s.avgOpapSales,
    s.avgVltNet,
    s.avgFnbSales,
    `${s.cashRatio}%`,
    `${s.posRatio}%`,
    s.avgDiscrepancy,
    `${s.avgExpensesToRevenue}%`,
    s.peakHour,
  ]);

  const kpiStoreSection = [
    [],
    ['3. ΔΕΙΚΤΕΣ ΑΠΟΔΟΣΗΣ ΑΝΑ ΚΑΤΑΣΤΗΜΑ (Store / Unit KPIs)'],
    ['Κατάστημα', 'Τύπος', 'GGR (€)', 'NGR (€)', 'Win/VLT/Ημέρα (€)', 'Πλήθος VLTs', 'OPEX/Τζίρος (%)', 'Περιθώριο FnB (%)', 'Shrinkage Rate (%)', 'Επισφαλείς Πιστώσεις (€)', 'Καθαρά Κέρδη (€)'],
  ];

  const kpiStoreRows = storeKpis.map((st) => [
    st.storeName,
    st.storeType,
    st.ggr,
    st.ngr,
    st.vltWinPerMachine,
    st.vltMachineCount,
    `${st.opexToRevenue}%`,
    `${st.fnbMargin}%`,
    `${st.shrinkageRate}%`,
    st.outstandingCredits,
    st.netProfit,
  ]);

  const wsKpis = XLSX.utils.aoa_to_sheet([
    ...kpiHeaders,
    ...kpiEmployeeRows,
    ...kpiShiftSection,
    ...kpiShiftRows,
    ...kpiStoreSection,
    ...kpiStoreRows,
  ]);
  XLSX.utils.book_append_sheet(wb, wsKpis, 'KPIs_Εργαζομένων_Βαρδιών');

  // -------------------------------------------------------------
  // Sheet 3: Συνολική Μισθοδοσία (Payroll)
  // -------------------------------------------------------------
  const payrollHeaders = [
    ['ShiftLedger - Αναλυτική Κατάσταση Μισθοδοσίας Προσωπικού'],
    [],
    [
      'Κατάστημα',
      'Ονοματεπώνυμο',
      'E-mail',
      'IBAN',
      'Βασικός Μισθός (€)',
      'Ημέρες Εργασίας',
      'Ώρες',
      'Υπερωρίες',
      'Bonus / Επιπλέον (€)',
      'Σύνολο Μισθοδοσίας (€)',
      'Ποσό σε Τράπεζα (€)',
      'Προκαταβολή (€)',
      'Στο Χέρι (€)',
    ],
  ];

  const payrollRows = payroll.map((p) => [
    p.storeName,
    p.name,
    p.email,
    p.iban || '-',
    p.baseSalary,
    p.daysWorked,
    p.hoursWorked,
    p.overtimeHours,
    p.bonus,
    p.totalPayroll,
    p.bankAmount,
    p.advancePayment,
    p.cashInHand,
  ]);

  const payrollTotal = payroll.reduce((sum, p) => sum + p.totalPayroll, 0);
  const bankTotal = payroll.reduce((sum, p) => sum + p.bankAmount, 0);
  const handTotal = payroll.reduce((sum, p) => sum + p.cashInHand, 0);
  const advanceTotal = payroll.reduce((sum, p) => sum + p.advancePayment, 0);

  const payrollTotalsRow = [
    'Σύνολο Μισθοδοσίας',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    payrollTotal,
    bankTotal,
    advanceTotal,
    handTotal,
  ];

  const wsPayroll = XLSX.utils.aoa_to_sheet([...payrollHeaders, ...payrollRows, [], payrollTotalsRow]);
  XLSX.utils.book_append_sheet(wb, wsPayroll, 'Συνολική Μισθοδοσία');

  // -------------------------------------------------------------
  // Sheet 4: Πάγια_Εταιρικά Έξοδα
  // -------------------------------------------------------------
  const fixedHeaders = [
    ['ShiftLedger - Πάγια Έξοδα Καταστημάτων & Εταιρικά Έξοδα'],
    [],
    ['1. ΠΑΓΙΑ ΕΞΟΔΑ ΑΝΑ ΚΑΤΑΣΤΗΜΑ'],
    ['Έξοδο', '100343 (€)', '400298 Play (€)', '100411 (€)', '143344 (€)', 'Σύνολο (€)'],
  ];

  const fixedRows = fixedExpenses.map((f) => [
    f.name,
    f.store100343,
    f.store400298,
    f.store100411,
    f.store143344,
    f.total,
  ]);

  const fixedTotal100343 = fixedExpenses.reduce((sum, f) => sum + f.store100343, 0);
  const fixedTotal400298 = fixedExpenses.reduce((sum, f) => sum + f.store400298, 0);
  const fixedTotal100411 = fixedExpenses.reduce((sum, f) => sum + f.store100411, 0);
  const fixedTotal143344 = fixedExpenses.reduce((sum, f) => sum + f.store143344, 0);
  const fixedTotalAll = fixedExpenses.reduce((sum, f) => sum + f.total, 0);

  const fixedTotalsRow = [
    'Σύνολο Παγίων',
    fixedTotal100343,
    fixedTotal400298,
    fixedTotal100411,
    fixedTotal143344,
    fixedTotalAll,
  ];

  const corpHeaders = [
    [],
    ['2. ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ & ΔΑΝΕΙΑ'],
    ['Κατηγορία', 'Περιγραφή / Δικαιούχος', 'Ποσό (€)'],
  ];

  const corpRows = CORPORATE_EXPENSES_LIST.map((c) => [
    c.category,
    c.name,
    c.amount,
  ]);

  const corpTotal = CORPORATE_EXPENSES_LIST.reduce((sum, c) => sum + c.amount, 0);
  const corpTotalsRow = ['Σύνολο Εταιρικών & Δανείων', '', corpTotal];

  const wsFixed = XLSX.utils.aoa_to_sheet([
    ...fixedHeaders,
    ...fixedRows,
    fixedTotalsRow,
    ...corpHeaders,
    ...corpRows,
    corpTotalsRow,
  ]);
  XLSX.utils.book_append_sheet(wb, wsFixed, 'Πάγια_Εταιρικά Έξοδα');

  // -------------------------------------------------------------
  // Sheet 5: P&L_100343_FnB (FnB Cash Registers)
  // -------------------------------------------------------------
  const fnbHeaders = [
    ['ShiftLedger - Ταμεία & Έξοδα FnB (Κατάστημα 100343_FnB)'],
    [],
    ['Ημερομηνία', 'Πρωινή Μετρητά (€)', 'Πρωινή POS (€)', 'Απογευματινή Μετρητά (€)', 'Απογευματινή POS (€)', 'Τζίρος PDA (€)', 'Έξοδα Ημέρας (€)', 'Καθαρό Ταμείο (€)'],
  ];

  const sampleFnbRows = [
    ['1/9/2024', 255.20, 24.40, 0, 0, 279.60, 0, 279.60],
    ['2/9/2024', 210.00, 7.30, 0, 0, 217.30, 340.71, -123.41],
    ['3/9/2024', 135.90, 12.80, 0, 0, 148.70, 57.82, 90.88],
    ['4/9/2024', 232.10, 0, 0, 0, 232.10, 10.00, 222.10],
    ['5/9/2024', 241.80, 16.10, 0, 0, 257.90, 158.49, 99.41],
    ['6/9/2024', 242.90, 24.30, 0, 0, 267.20, 199.49, 67.71],
    ['7/9/2024', 169.60, 11.80, 0, 0, 181.40, 182.17, -0.77],
    ['8/9/2024', 181.40, 35.00, 0, 0, 216.40, 0, 216.40],
    ['9/9/2024', 196.80, 13.90, 0, 0, 210.70, 53.63, 157.07],
    ['10/9/2024', 188.90, 16.80, 0, 0, 205.70, 259.27, -53.57],
    ['11/9/2024', 182.00, 9.60, 0, 0, 191.60, 0, 191.60],
    ['12/9/2024', 187.60, 5.10, 0, 0, 192.70, 90.71, 101.99],
    ['13/9/2024', 199.10, 16.60, 0, 0, 215.70, 95.51, 120.19],
    ['14/9/2024', 219.70, 5.50, 0, 0, 225.20, 294.11, -68.91],
    ['15/9/2024', 279.90, 15.30, 0, 0, 295.20, 0, 295.20],
    ['16/9/2024', 230.80, 16.30, 0, 0, 247.10, 331.43, -84.33],
    ['17/9/2024', 247.10, 16.30, 0, 0, 263.40, 0, 263.40],
    ['18/9/2024', 220.30, 20.40, 0, 0, 240.70, 293.33, -52.63],
    ['19/9/2024', 216.20, 21.90, 0, 0, 238.10, 0, 238.10],
    ['20/9/2024', 255.80, 13.30, 0, 0, 269.10, 47.61, 221.49],
    ['21/9/2024', 263.90, 11.30, 0, 0, 275.20, 165.81, 109.39],
    ['22/9/2024', 257.00, 23.10, 0, 0, 280.10, 0, 280.10],
    ['23/9/2024', 186.70, 15.30, 0, 0, 202.00, 332.51, -130.51],
  ];

  const fnbTotalsRow = [
    'Σύνολο Μήνα',
    4970.90,
    382.20,
    0,
    0,
    5353.10,
    2912.60,
    2440.50,
  ];

  const wsFnb = XLSX.utils.aoa_to_sheet([...fnbHeaders, ...sampleFnbRows, [], fnbTotalsRow]);
  XLSX.utils.book_append_sheet(wb, wsFnb, 'P&L_100343_FnB');

  // -------------------------------------------------------------
  // Sheet 6: VLT_Καταμετρήσεις (VLTs Reconciliations)
  // -------------------------------------------------------------
  const vltHeaders = [
    ['ShiftLedger - Εκκαθαρίσεις & Καταμετρήσεις VLTs Opapnet vs Ταμείου'],
    [],
    ['Ημερομηνία', 'Ποσό Opapnet (€)', 'Καταμέτρηση Ταμείου (€)', 'Διαφορά (€)', 'Κατάσταση'],
  ];

  const vltRows = VLT_RECONCILIATIONS_SAMPLE.map((v) => [
    v.date,
    v.opapnetAmount,
    v.countedAmount,
    v.difference,
    v.status === 'BALANCED' ? 'Ισοζυγισμένο (OK)' : 'Απόκλιση',
  ]);

  const wsVlt = XLSX.utils.aoa_to_sheet([...vltHeaders, ...vltRows]);
  XLSX.utils.book_append_sheet(wb, wsVlt, 'Καταμετρήσεις_VLTs');

  // -------------------------------------------------------------
  // Sheet 7: Πρόγραμμα Προσωπικού (Schedule & Roster)
  // -------------------------------------------------------------
  const rosterData = [
    ['ShiftLedger - Εβδομαδιαίο Πρόγραμμα Προσωπικού & Βάρδιες'],
    [],
  ];

  WEEKLY_ROSTER_SAMPLE.forEach((r) => {
    rosterData.push([`Κατάστημα: ${r.storeName}`]);
    rosterData.push(['Βάρδια', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']);
    r.schedule.forEach((s) => {
      rosterData.push([s.shift, s.mon, s.tue, s.wed, s.thu, s.fri, s.sat, s.sun]);
    });
    rosterData.push([]);
  });

  const wsRoster = XLSX.utils.aoa_to_sheet(rosterData);
  XLSX.utils.book_append_sheet(wb, wsRoster, 'Πρόγραμμα_Προσωπικού');

  // Generate binary and trigger download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ShiftLedger_PnL_KPIs_Report_${options.month || '09'}_${options.year || '2024'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
